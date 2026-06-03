package com.nestnepal.sejda;

import org.sejda.core.service.DefaultTaskExecutionService;
import org.sejda.core.service.TaskExecutionService;
import org.sejda.model.input.PdfMergeInput;
import org.sejda.model.input.PdfStreamSource;
import org.sejda.model.output.ExistingOutputPolicy;
import org.sejda.model.output.FileOrDirectoryTaskOutput;
import org.sejda.model.output.FileTaskOutput;
import org.sejda.model.parameter.ExtractPagesParameters;
import org.sejda.model.parameter.MergeParameters;
import org.sejda.model.parameter.RotateParameters;
import org.sejda.model.parameter.SplitByEveryXPagesParameters;
import org.sejda.model.pdf.page.PageRange;
import org.sejda.model.rotation.Rotation;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * REST surface mirroring the page-level ops on the DCAP frontend.
 *
 * Sejda 5.x runs tasks through `TaskExecutionService.execute(params)`
 * — the service registry picks the right Task implementation for the
 * parameter type and handles the init/before/execute/after lifecycle.
 * Calling `task.execute()` directly throws NPE because the output
 * writer is set up by init().
 */
@RestController
@RequestMapping("/api")
public class PdfController {

    private final TaskExecutionService sejda = new DefaultTaskExecutionService();

    /** Health probe — used by Render / Railway / uptime monitors. */
    @GetMapping("/health")
    public String health() {
        return "ok";
    }

    /** Merge N PDFs in upload order. Single multipart param `files`. */
    @PostMapping(value = "/merge", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> merge(@RequestParam("files") MultipartFile[] files) throws Exception {
        if (files == null || files.length < 2) {
            return ResponseEntity.badRequest().body("Merge needs at least 2 PDFs".getBytes());
        }
        File outFile = Files.createTempFile("sejda-merge-", ".pdf").toFile();
        outFile.delete(); // OVERWRITE policy needs it to be either absent or pre-existing — start absent.
        try {
            MergeParameters params = new MergeParameters();
            for (int i = 0; i < files.length; i++) {
                MultipartFile f = files[i];
                params.addInput(new PdfMergeInput(PdfStreamSource.newInstanceNoPassword(
                        f.getInputStream(), safeName(f.getOriginalFilename(), "input-" + i + ".pdf"))));
            }
            params.setOutput(new FileTaskOutput(outFile));
            params.setExistingOutputPolicy(ExistingOutputPolicy.OVERWRITE);
            sejda.execute(params);
            return pdfResponse(Files.readAllBytes(outFile.toPath()), "merged.pdf");
        } finally {
            outFile.delete();
        }
    }

    /** Rotate every page by 90 / 180 / 270 degrees. */
    @PostMapping(value = "/rotate", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> rotate(@RequestParam("file") MultipartFile file,
                                         @RequestParam(value = "degrees", defaultValue = "90") int degrees) throws Exception {
        Rotation rot = switch (degrees) {
            case 90 -> Rotation.DEGREES_90;
            case 180 -> Rotation.DEGREES_180;
            case 270 -> Rotation.DEGREES_270;
            default -> Rotation.DEGREES_90;
        };
        File outFile = Files.createTempFile("sejda-rotate-", ".pdf").toFile();
        outFile.delete();
        try {
            RotateParameters params = new RotateParameters(rot);
            params.addSource(PdfStreamSource.newInstanceNoPassword(file.getInputStream(),
                    safeName(file.getOriginalFilename(), "input.pdf")));
            params.setOutput(FileOrDirectoryTaskOutput.file(outFile));
            params.setExistingOutputPolicy(ExistingOutputPolicy.OVERWRITE);
            sejda.execute(params);
            return pdfResponse(Files.readAllBytes(outFile.toPath()), "rotated.pdf");
        } finally {
            outFile.delete();
        }
    }

    /** Extract a set of pages as a new PDF. `pages` is a comma-list of
     *  1-based page numbers or ranges, e.g. "1,3,5-7". */
    @PostMapping(value = "/extract", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> extract(@RequestParam("file") MultipartFile file,
                                          @RequestParam("pages") String pages) throws Exception {
        File outFile = Files.createTempFile("sejda-extract-", ".pdf").toFile();
        outFile.delete();
        try {
            ExtractPagesParameters params = new ExtractPagesParameters();
            params.addSource(PdfStreamSource.newInstanceNoPassword(file.getInputStream(),
                    safeName(file.getOriginalFilename(), "input.pdf")));
            for (String token : pages.split(",")) {
                String t = token.trim();
                if (t.isEmpty()) continue;
                if (t.contains("-")) {
                    String[] r = t.split("-");
                    params.addPageRange(new PageRange(Integer.parseInt(r[0].trim()), Integer.parseInt(r[1].trim())));
                } else {
                    int p = Integer.parseInt(t);
                    params.addPageRange(new PageRange(p, p));
                }
            }
            params.setOutput(FileOrDirectoryTaskOutput.file(outFile));
            params.setExistingOutputPolicy(ExistingOutputPolicy.OVERWRITE);
            sejda.execute(params);
            return pdfResponse(Files.readAllBytes(outFile.toPath()), "extract.pdf");
        } finally {
            outFile.delete();
        }
    }

    /** Split into chunks of N pages each. Returns a ZIP of the chunks. */
    @PostMapping(value = "/split", produces = "application/zip")
    public ResponseEntity<byte[]> split(@RequestParam("file") MultipartFile file,
                                        @RequestParam(value = "pagesPerChunk", defaultValue = "1") int pagesPerChunk) throws Exception {
        Path tmpDir = Files.createTempDirectory("sejda-split-");
        try {
            SplitByEveryXPagesParameters params = new SplitByEveryXPagesParameters(Math.max(1, pagesPerChunk));
            params.addSource(PdfStreamSource.newInstanceNoPassword(file.getInputStream(),
                    safeName(file.getOriginalFilename(), "input.pdf")));
            params.setOutput(FileOrDirectoryTaskOutput.directory(tmpDir.toFile()));
            params.setExistingOutputPolicy(ExistingOutputPolicy.OVERWRITE);
            // Filename placeholders Sejda recognises: [CURRENTPAGE],
            // [FILENUMBER]. TOTALFILESNUMBER isn't substituted in this
            // version so we keep the pattern simple.
            params.setOutputPrefix("chunk-[FILENUMBER]-page-[CURRENTPAGE]-");
            sejda.execute(params);

            // Zip the chunks into a single response body.
            ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(zipBytes)) {
                File[] outputs = tmpDir.toFile().listFiles((d, n) -> n.toLowerCase().endsWith(".pdf"));
                if (outputs != null) {
                    Arrays.sort(outputs);
                    for (File f : outputs) {
                        zos.putNextEntry(new ZipEntry(f.getName()));
                        Files.copy(f.toPath(), zos);
                        zos.closeEntry();
                    }
                }
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("application/zip"));
            headers.setContentDisposition(ContentDisposition.attachment().filename("split-chunks.zip").build());
            return new ResponseEntity<>(zipBytes.toByteArray(), headers, 200);
        } finally {
            try (var s = Files.walk(tmpDir)) {
                s.sorted(Comparator.reverseOrder()).forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) {} });
            } catch (Exception ignored) {}
        }
    }

    // ── helpers ─────────────────────────────────────────────────────

    private static ResponseEntity<byte[]> pdfResponse(byte[] bytes, String filename) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDisposition(ContentDisposition.attachment().filename(filename).build());
        return new ResponseEntity<>(bytes, headers, 200);
    }

    private static String safeName(String raw, String fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        return raw.replaceAll("[\\r\\n]", "").trim();
    }
}
