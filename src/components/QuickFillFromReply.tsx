import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Wand2, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseQuoteRequest, type ParsedQuoteRequest, type PlanCatalogEntry } from "@/utils/quoteParser";

interface Props {
  darkMode?: boolean;
  /** Fired when the user clicks "Parse & Fill". Receives the parsed bag —
   *  the consumer decides which fields to write back to its own state. */
  onApply: (parsed: ParsedQuoteRequest) => void;
  /** Optional catalog passed through to `parseQuoteRequest` for product
   *  matching. Only QGAP needs this; other tabs leave it undefined. */
  catalog?: PlanCatalogEntry[];
  /** Whether to render the product-match line in the "Extracted" preview.
   *  Defaults to `true` when a catalog is supplied. */
  showProductMatch?: boolean;
  /** Display name for a matched product category — only used when
   *  `showProductMatch` is true. Maps categoryKey → human label. */
  categoryLabel?: (categoryKey: string) => string;
  /** Optional accent colour for the "Parse & Fill" button. Defaults to the
   *  brand blue. */
  accentColor?: string;
  /** Override the placeholder example text. Useful for tabs that don't
   *  surface qty/product hints. */
  placeholder?: string;
  /** Card title. Defaults to "Quick fill from customer's reply". */
  title?: string;
}

const DEFAULT_ACCENT = "#0F766E";  // brand teal-700

const DEFAULT_PLACEHOLDER = `Paste the customer's reply here. Recognised labels:

Individual Full Name- John Doe
Company Name- Acme Pvt Ltd
Contact number- 9841234567
Address- Putalisadak, Kathmandu
Email Address- john@acme.com

Bare WhatsApp pastes also work — name/company/phone/email/address are detected by shape when labels are absent.`;

const QuickFillFromReply: React.FC<Props> = ({
  darkMode = false,
  onApply,
  catalog,
  showProductMatch = !!catalog,
  categoryLabel,
  accentColor = DEFAULT_ACCENT,
  placeholder = DEFAULT_PLACEHOLDER,
  title = "Quick fill from customer's reply",
}) => {
  const dm = darkMode;
  const [parseInput, setParseInput] = useState("");
  const [parsed, setParsed] = useState<ParsedQuoteRequest | null>(null);
  const { toast } = useToast();

  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? "text-gray-400" : "text-gray-500"}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? "bg-gray-800 text-white border-gray-700" : "bg-white text-gray-900 border-gray-300"} border focus:border-violet-400`;

  const handleParse = () => {
    if (!parseInput.trim()) return;
    const out = parseQuoteRequest(parseInput, { catalog });
    setParsed(out);
    onApply(out);
    toast({
      title: "Parsed",
      description:
        [
          out.companyName && "company",
          out.email && "email",
          out.contact && "phone",
          out.address && "address",
          out.fullName && "contact person",
          out.qtyHint && `qty (${out.qtyHint})`,
          out.productMatch && `product: ${out.productMatch.planName}`,
        ]
          .filter(Boolean)
          .join(", ") || "no recognised fields",
    });
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <Label className={labelCls}>
          <Wand2 className="w-3 h-3 inline mr-1" /> {title}
        </Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-7"
            onClick={() => {
              setParseInput("");
              setParsed(null);
            }}
            disabled={!parseInput && !parsed}
          >
            <Eraser className="w-3 h-3" /> Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 h-7"
            style={{ background: accentColor, color: "#fff" }}
            onClick={handleParse}
          >
            <Wand2 className="w-3 h-3" /> Parse &amp; Fill
          </Button>
        </div>
      </div>
      <Textarea
        value={parseInput}
        onChange={(e) => setParseInput(e.target.value)}
        rows={6}
        placeholder={placeholder}
        className={`${inputCls} font-mono text-xs leading-snug`}
      />
      {parsed && (
        <div className={`mt-3 p-3 rounded-lg text-xs ${dm ? "bg-gray-800/50" : "bg-white/60 border border-gray-200"}`}>
          <div className={`text-[10px] uppercase tracking-wider mb-2 ${dm ? "text-gray-500" : "text-gray-500"}`}>
            Extracted
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
            {parsed.fullName && (
              <div>
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Contact person:</strong> {parsed.fullName}
              </div>
            )}
            {parsed.companyName && (
              <div>
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Company:</strong> {parsed.companyName}
              </div>
            )}
            {parsed.contact && (
              <div>
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Phone:</strong> {parsed.contact}
              </div>
            )}
            {parsed.email && (
              <div>
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Email:</strong> {parsed.email}
              </div>
            )}
            {parsed.address && (
              <div className="md:col-span-2">
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Address:</strong> {parsed.address}
              </div>
            )}
            {parsed.qtyHint && (
              <div>
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Qty hint:</strong> {parsed.qtyHint}
              </div>
            )}
            {showProductMatch && parsed.productMatch && (
              <div className="md:col-span-2">
                <strong className={dm ? "text-gray-300" : "text-gray-700"}>Product:</strong>{" "}
                {parsed.productMatch.planName}{" "}
                <Badge variant="outline" className="text-[9px] h-4 ml-1">
                  {categoryLabel ? categoryLabel(parsed.productMatch.categoryKey) : parsed.productMatch.categoryKey}
                  {" · "}
                  {parsed.productMatch.confidence}
                </Badge>
              </div>
            )}
          </div>
          {parsed.unmatchedLines.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-300/30">
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${dm ? "text-amber-400" : "text-amber-600"}`}>
                Unrecognised labels
              </div>
              <ul className={`text-[11px] list-disc ml-4 space-y-0.5 ${dm ? "text-gray-400" : "text-gray-600"}`}>
                {parsed.unmatchedLines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QuickFillFromReply;
