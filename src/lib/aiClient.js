// AI Client targeting OCR.space and Groq
const OCR_API_KEY = process.env.REACT_APP_OCR_API_KEY;
const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY;

// 1. Extract Text from PDF (Reliable version)
export async function extractTextFromPDF(fileOrUrl) {
  try {
    let blob;
    let fileName = 'document.pdf';

    if (fileOrUrl instanceof File) {
      blob = fileOrUrl;
      fileName = fileOrUrl.name;
    } else {
      // Fetch the local PDF file as a blob
      const response = await fetch(fileOrUrl);
      if (!response.ok) throw new Error("Could not fetch the PDF file.");
      blob = await response.blob();
      fileName = fileOrUrl.split('/').pop() || 'document.pdf';
    }

    // Check if filename suggests Arabic
    const isArabic = fileName.toLowerCase().includes('arabic');
    const language = isArabic ? 'ara' : 'eng';

    // Prepare form data for OCR.space
    const formData = new FormData();
    formData.append('file', blob, fileName);
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
      throw new Error("No text could be extracted. The file might be too large (max 5MB) or unreadable.");
    }

    const extractedText = ocrData.ParsedResults.map(p => p.ParsedText).join('\n\n');
    
    if (!extractedText.trim()) {
      throw new Error("The file was scanned but no readable text was found.");
    }

    return extractedText;

  } catch (err) {
    console.error("OCR Extraction Error:", err);
    throw err;
  }
}

// 2. Query Groq
export async function queryGroq(prompt, extractedText, mode = 'summary') {
  try {
    const systemPrompt = `You are a strict, highly accurate AI teacher. 
You will be given text extracted from a textbook.
Your job is to generate study materials based ONLY on the provided text.`;

    let taskPrompt = prompt;
    if (mode === 'quiz') {
      taskPrompt = `Based on the following text, generate a 5-question multiple choice quiz. 
Return ONLY a valid JSON array of objects. 
Shape: {"question": "...", "options": ["...", "...", "...", "..."], "answer": "exact correct option string"}\n\nTEXT:\n${extractedText}`;
    } else if (mode === 'flashcards') {
      taskPrompt = `Based on the following text, extract 6 key facts or definitions. 
Return ONLY a valid JSON array of objects. 
Shape: {"front": "Term or Key Concept", "back": "Detailed Fact or Definition"}\n\nTEXT:\n${extractedText}`;
    } else if (mode === 'summary') {
      taskPrompt = `Based on the following text, provide a concise but comprehensive summary. Use bullet points and headers. Format as clean Markdown.\n\nTEXT:\n${extractedText}`;
    }

    const payload = {
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: taskPrompt }
      ],
      temperature: 0.2,
    };

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!groqResponse.ok) throw new Error(`Groq API Error: ${await groqResponse.text()}`);

    const result = await groqResponse.json();
    let content = result.choices[0].message.content.trim();

    if (mode === 'quiz' || mode === 'flashcards') {
      content = content.replace(/^```(json)?/, '').replace(/```$/, '').trim();
      try {
        return JSON.parse(content);
      } catch (e) {
        throw new Error("AI returned malformed data. Try again.");
      }
    }

    return content;

  } catch (err) {
    console.error("Groq Gen Error:", err);
    throw err;
  }
}
