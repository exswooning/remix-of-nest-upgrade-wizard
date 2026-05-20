import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'templates';

export interface RfpDocxData {
  ref_no: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: string;
  amount_words: string;
  recipient_name: string;
  recipient_org: string;
  service_for: string;
  service_term: string;
  service_reference: string;
  payee_name: string;
  bank_name: string;
  bank_account: string;
  signatory_name: string;
  signatory_position: string;
  description: string;
  notes: string;
  contract_id: string;
  client_company_name: string;
  client_location: string;
}

async function fetchDefaultRfpTemplatePath(): Promise<string> {
  const { data, error } = await supabase
    .from('document_templates')
    .select('storage_path, source_kind, name')
    .eq('template_type', 'rfp')
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw new Error(`Lookup failed: ${error.message}`);
  if (!data) throw new Error('No default RfP template set. Upload one in Settings → Templates and mark it as default.');
  if (data.source_kind !== 'docx' || !data.storage_path) {
    throw new Error(`Default RfP template "${data.name}" is not a .docx file.`);
  }
  if (!/\.docx$/i.test(data.storage_path)) {
    throw new Error(`Default RfP template "${data.name}" is a letterhead image, not a .docx — generate PDF instead.`);
  }
  return data.storage_path;
}

async function downloadTemplate(path: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Could not download template: ${error?.message ?? 'unknown'}`);
  return await data.arrayBuffer();
}

export async function fetchDefaultRfpTemplateBuffer(): Promise<ArrayBuffer> {
  const path = await fetchDefaultRfpTemplatePath();
  return await downloadTemplate(path);
}

export function mergeRfpDocx(templateBuffer: ArrayBuffer, values: RfpDocxData): Uint8Array {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '<<', end: '>>' },
  });

  try {
    doc.render(values);
  } catch (e: any) {
    const detail = e?.properties?.errors
      ? e.properties.errors.map((er: any) => er.properties?.explanation || er.message).join('; ')
      : (e?.message ?? 'render failed');
    throw new Error(`Template render error: ${detail}`);
  }

  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function generateRfpDocx(values: RfpDocxData, filename: string): Promise<void> {
  const buffer = await fetchDefaultRfpTemplateBuffer();
  const merged = mergeRfpDocx(buffer, values);
  const blob = new Blob([merged], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  saveAs(blob, filename);
}
