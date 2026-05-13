import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

// Set up pdfjs worker using a reliable CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const OCR_API_KEY = process.env.REACT_APP_OCR_API_KEY;
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY;
const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY;

/**
 * Main entry point for text extraction.
 * Supports PDF, PPTX, and Images.
 */
export async function extractTextFromFile(file) {
  const fileName = file.name.toLowerCase();
  const fileSize = file.size;

  try {
    if (fileName.endsWith('.pdf')) {
      return await extractTextFromPDFLocal(file);
    } else if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
      return await extractTextFromPPTX(file);
    } else if (file.type.startsWith('image/')) {
      return await extractTextViaOCR(file);
    } else {
      throw new Error("Unsupported file type. Please upload a PDF, PowerPoint, or Image.");
    }
  } catch (err) {
    console.error("Extraction Error:", err);
    throw err;
  }
}

// 1. Local PDF Extraction
async function extractTextFromPDFLocal(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + "\n\n";
    }

    // If local extraction failed to find text, it might be a scanned PDF
    if (!fullText.trim()) {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("This PDF appears to be a scanned image and is too large (>5MB) for OCR processing. Please use a digital PDF or a smaller file.");
      }
      return await extractTextViaOCR(file);
    }

    return fullText;
  } catch (err) {
    if (file.size <= 5 * 1024 * 1024) {
      return await extractTextViaOCR(file);
    }
    throw err;
  }
}

// 2. Local PPTX Extraction
async function extractTextFromPPTX(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    let fullText = "";

    // PPTX stores slides in ppt/slides/slideN.xml
    const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
    
    // Sort slides numerically
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });

    for (const slideFile of slideFiles) {
      const content = await zip.file(slideFile).async("string");
      // Basic XML parsing to find <a:t> tags which contain text
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, "text/xml");
      const textNodes = xmlDoc.getElementsByTagName("a:t");
      
      for (let i = 0; i < textNodes.length; i++) {
        fullText += textNodes[i].textContent + " ";
      }
      fullText += "\n\n";
    }

    if (!fullText.trim()) {
      throw new Error("No readable text found in this PowerPoint. It might be composed entirely of images.");
    }

    return fullText;
  } catch (err) {
    console.error("PPTX Error:", err);
    throw new Error("Failed to extract text from PowerPoint. Make sure it is a valid .pptx file.");
  }
}

// 3. Fallback OCR (Original logic)
async function extractTextViaOCR(file) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File is too large for OCR processing (Max 5MB for scanned documents). Please upload a digital version.");
  }

  const isArabic = file.name.toLowerCase().includes('arabic');
  const language = isArabic ? 'ara' : 'eng';

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('language', language);
  formData.append('isOverlayRequired', 'false');
  formData.append('OCREngine', '2');
  formData.append('isTable', 'true');

  const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'apikey': OCR_API_KEY },
    body: formData
  });

  const ocrData = await ocrResponse.json();

  if (ocrData.IsErroredOnProcessing) {
    const msg = ocrData.ErrorMessage ? ocrData.ErrorMessage[0] : 'OCR Processing failed';
    throw new Error(msg);
  }

  if (!ocrData.ParsedResults || ocrData.ParsedResults.length === 0) {
    throw new Error("No text could be extracted.");
  }

  const extractedText = ocrData.ParsedResults.map(p => p.ParsedText).join('\n\n');
  
  if (!extractedText.trim()) {
    throw new Error("No readable text found in the document.");
  }

  return extractedText;
}

// Backward compatibility or renamed export
export const extractTextFromPDF = extractTextFromFile;

// 4. Query AI (OpenAI with Groq Fallback)
export async function queryAI(prompt, extractedText, mode = 'summary') {
  const systemPrompt = `You are a strict, highly accurate AI teacher. 
You will be given text extracted from a textbook or lesson.
Your job is to generate study materials based ONLY on the provided text.`;

  let taskPrompt = prompt;
  if (mode === 'quiz') {
    taskPrompt = `Based on the following text, generate a 5-question multiple choice quiz. 
Return ONLY a valid JSON object. 
Format: { "quiz": [{"question": "...", "options": ["...", "...", "...", "..."], "answer": "exact correct option string"}] }\n\nTEXT:\n${extractedText}`;
  } else if (mode === 'flashcards') {
    taskPrompt = `Based on the following text, extract 6 key facts or definitions. 
Return ONLY a valid JSON object. 
Format: { "flashcards": [{"front": "Term or Key Concept", "back": "Detailed Fact or Definition"}] }\n\nTEXT:\n${extractedText}`;
  } else if (mode === 'summary') {
    taskPrompt = `Based on the following text, provide a concise but comprehensive summary. Use bullet points and headers. Format as clean Markdown.\n\nTEXT:\n${extractedText}`;
  }

  // Attempt OpenAI first
  try {
    if (!OPENAI_API_KEY) throw new Error("OpenAI Key Missing");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: taskPrompt }
        ],
        temperature: 0.2,
        response_format: (mode === 'quiz' || mode === 'flashcards') ? { type: "json_object" } : undefined
      })
    });

    const result = await response.json();
    if (!response.ok) {
      if (result.error?.code === 'insufficient_quota') {
        throw new Error("OPENAI_QUOTA_EXCEEDED");
      }
      throw new Error(`OpenAI Error: ${result.error?.message || 'Unknown'}`);
    }

    let content = result.choices[0].message.content.trim();
    if (mode === 'quiz' || mode === 'flashcards') {
      const parsed = JSON.parse(content);
      return parsed[mode] || parsed;
    }
    return content;

  } catch (err) {
    if (err.message === "OPENAI_QUOTA_EXCEEDED" || err.message === "OpenAI Key Missing") {
      console.warn("Falling back to Groq due to OpenAI issues...");
      return await queryGroqDirect(systemPrompt, taskPrompt, mode);
    }
    throw err;
  }
}

// Internal direct call to Groq for fallback
async function queryGroqDirect(systemPrompt, taskPrompt, mode) {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: taskPrompt }
        ],
        temperature: 0.2,
      })
    });

    if (!response.ok) throw new Error(`Groq API Error: ${await response.text()}`);

    const result = await response.json();
    let content = result.choices[0].message.content.trim();

    if (mode === 'quiz' || mode === 'flashcards') {
      content = content.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(content);
      // If it's an object with the key (because of the prompt format), extract it
      return parsed[mode] || parsed;
    }

    return content;
  } catch (err) {
    console.error("Groq Fallback Error:", err);
    throw new Error("All AI services failed. Please check your internet or API keys.");
  }
}

// Export as queryGroq for backward compatibility
export const queryGroq = queryAI;
