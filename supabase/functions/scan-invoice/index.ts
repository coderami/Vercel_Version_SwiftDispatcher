import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  console.log('[scan-invoice] Function invoked, method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('[scan-invoice] LOVABLE_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'API Key not configured. LOVABLE_API_KEY is missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { images } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided. Send { "images": ["base64..."] }' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scan-invoice] Received ${images.length} image(s) to process`);

    const results = [];

    for (let i = 0; i < images.length; i++) {
      console.log(`[scan-invoice] Processing image ${i + 1}/${images.length}`);

      // Strip data URL prefix if present
      const base64Data = images[i].replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      const prompt = `You are a Logistics Data Entry Expert analyzing a photo of a delivery invoice or pick-up slip. Use ZONE-BASED extraction.

THE THREE ZONES:
- RED ZONE (Invoice Number): TOP-RIGHT corner, in/near a box labeled "INVOICE NUMBER", "INVOICE #", or "DOC #". Extract the bold large number printed there. IGNORE small print, barcodes, reference numbers, or anything at the bottom of the page.
- BLUE ZONE (Sold To / Bill To): TOP-LEFT section under headings like "SOLD TO", "BILL TO", or "CUSTOMER".
- GREEN ZONE (Ship To): MIDDLE-RIGHT section under headings like "SHIP TO", "DELIVER TO", or "SHIPPING ADDRESS", usually above the parts/line-items table.

PRIORITY RULE FOR ADDRESS (CRITICAL):
1. Check the GREEN ZONE first. If it contains a valid address (has a street number AND a Canadian postal code in format LNL NLN), USE IT and stop searching.
2. Only fall back to the BLUE ZONE address if the GREEN ZONE is empty, missing, or does not contain a recognizable address.

ADDRESS BLOCK PARSING (3-LINE RULE) — applied to whichever zone wins:
- Line 1 = Company Name → IGNORE for the address field (use it only as a hint for client_name if a Sold-To name is missing).
- Line 2 = Street line. Formats to detect:
    * "123 Main St Unit 5"   -> keep "123 Main St"
    * "Unit 5-185 Main St"   -> the number AFTER the dash is the street number -> "185 Main St"
    * "#8-85 Main St"        -> "85 Main St"
- Line 3 = "City, Province  L5N 2H1" with a Canadian postal code (pattern: Letter-Digit-Letter Digit-Letter-Digit).

CLEANUP BEFORE RETURNING THE ADDRESS:
- Drop the company-name line entirely.
- Strip "#" symbols and the word "UNIT" (plus any unit number that follows) from the street line.
- Replace any \\n newline characters with a single space.
- Collapse extra spaces. Final form: "<street number> <street name>, <City>, <Province> <Postal Code>".

CLIENT NAME:
- For "client_name": prefer the company name from whichever zone supplied the address (Green if used, else Blue).

OUTPUT — return ONLY a raw JSON object, no markdown, no commentary:
{"client_name": "...", "address": "...", "invoice_number": "...", "is_pickup": false}

- "is_pickup": true ONLY if the document is clearly a pick-up slip / pick-up order.
- If a field truly cannot be found, use "N/A" for strings and false for is_pickup.
- Return ONLY the JSON object.`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(
          'https://ai.gateway.lovable.dev/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/jpeg;base64,${base64Data}`,
                      },
                    },
                  ],
                },
              ],
              temperature: 0.1,
              max_tokens: 512,
            }),
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`[scan-invoice] API error ${response.status}:`, errBody);

          if (response.status === 429) {
            return new Response(
              JSON.stringify({
                error: 'rate_limit',
                message: 'System busy. Please wait 10 seconds before scanning next batch.',
              }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          results.push({
            client_name: 'Unknown',
            address: 'Unknown',
            invoice_number: `ERR-${Date.now()}`,
            is_pickup: false,
          });
          continue;
        }

        const data = await response.json();
        console.log(`[scan-invoice] API responded for image ${i + 1}`);

        const textContent = data?.choices?.[0]?.message?.content || '';

        // Clean markdown fences if model wraps them anyway
        const cleaned = textContent
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        try {
          const parsed = JSON.parse(cleaned);
          results.push({
            client_name: parsed.client_name || 'Unknown',
            address: parsed.address || 'Unknown',
            invoice_number: parsed.invoice_number || `SCAN-${Date.now()}`,
            is_pickup: parsed.is_pickup === true,
          });
        } catch (parseErr) {
          console.error('[scan-invoice] JSON parse failed:', cleaned);
          results.push({
            client_name: 'Unknown',
            address: 'Unknown',
            invoice_number: `PARSE-${Date.now()}`,
            is_pickup: false,
          });
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          console.error(`[scan-invoice] Timeout on image ${i + 1}`);
          results.push({
            client_name: 'Unknown',
            address: 'Unknown',
            invoice_number: `TIMEOUT-${Date.now()}`,
            is_pickup: false,
          });
        } else {
          console.error(`[scan-invoice] Fetch error on image ${i + 1}:`, fetchErr);
          results.push({
            client_name: 'Unknown',
            address: 'Unknown',
            invoice_number: `ERR-${Date.now()}`,
            is_pickup: false,
          });
        }
      }
    }

    console.log(`[scan-invoice] Done. Returning ${results.length} result(s)`);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[scan-invoice] Unhandled error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
