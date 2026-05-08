import React, { useState } from 'react';
import { extractTextFromPDF, queryGroq } from '../lib/aiClient';
import { MdLibraryBooks, MdOutlineQuiz, MdFormatListBulleted } from 'react-icons/md';
import { BsCardText } from 'react-icons/bs';

export default function AiAssistant() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState(null);
  
  // Results
  const [activeTab, setActiveTab] = useState('summary'); 
  const [results, setResults] = useState({
    summary: null,
    quiz: null,
    flashcards: null,
  });

  // Interactive Quiz State
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Interactive Flashcard State
  const [flippedCards, setFlippedCards] = useState({});

  const handleGenerate = async (mode) => {
    if (!selectedFile && !pasteText.trim()) {
      setError("Please upload a file or paste some text first!");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(prev => ({ ...prev, [mode]: null }));
    setActiveTab(mode);
    
    // Reset interaction states
    setQuizAnswers({});
    setQuizSubmitted(false);
    setFlippedCards({});

    try {
      let extractedText = pasteText;

      if (selectedFile) {
        setLoadingStep('1/2 Extracting Text from File via OCR...');
        extractedText = await extractTextFromPDF(selectedFile);
      }
      
      setLoadingStep(`2/2 Generating ${mode === 'flashcards' ? 'Flashcards' : mode === 'quiz' ? 'Quiz' : 'Summary'} via AI...`);
      const aiData = await queryGroq('', extractedText, mode);

      setResults(prev => ({ ...prev, [mode]: aiData }));
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const toggleFlashcard = (idx) => {
    setFlippedCards(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const selectQuizAnswer = (qIdx, option) => {
    if (quizSubmitted) return;
    setQuizAnswers(prev => ({ ...prev, [qIdx]: option }));
  };

  const checkQuizScore = () => {
    let correct = 0;
    results.quiz.forEach((q, i) => {
      if (quizAnswers[i] === q.answer) correct++;
    });
    return correct;
  };

  const formatSummary = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('##')) return <h3 key={i} style={{color: 'var(--gold)', marginTop: 16}}>{line.replace(/#/g, '').trim()}</h3>;
      if (line.startsWith('#')) return <h2 key={i} style={{color: 'var(--accent)', marginTop: 20}}>{line.replace(/#/g, '').trim()}</h2>;
      if (line.startsWith('-') || line.startsWith('*')) return <li key={i} style={{marginLeft: 20, marginBottom: 8}}>{line.substring(1).trim().replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}</li>;
      return <p key={i} style={{marginBottom: 12}} dangerouslySetInnerHTML={{__html: line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}} />;
    });
  };

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, animation: 'fadeIn 0.4s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 3, height: 24, background: 'linear-gradient(180deg, #00ff88, transparent)', borderRadius: 2 }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, letterSpacing: 4, color: 'var(--text-primary)' }}>
            AI STUDY HUB
          </h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 15 }}>
          Upload your notes or paste text to generate interactive study materials.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Input Sidebar */}
        <div className="card" style={{ padding: 24, animation: 'fadeIn 0.4s ease 0.1s both' }}>
          <h3 style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 12 }}>OPTION 1: TEXT ENTRY</h3>
          <button 
            className="btn btn-outline"
            style={{ 
              width: '100%', marginBottom: 24, padding: '14px', fontSize: 13, 
              textAlign: 'center', display: 'flex', alignItems: 'center', 
              justifyContent: 'center', gap: 8,
              borderColor: pasteText.trim() ? 'var(--gold)' : 'var(--accent-border)',
              color: pasteText.trim() ? 'var(--gold)' : 'var(--accent)'
            }}
            onClick={() => setShowPasteModal(true)}
          >
            {pasteText.trim() ? '✓ Text Ready' : 'Paste Lesson Text...'}
          </button>

          <h3 style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 12 }}>OPTION 2: UPLOAD IMAGE/PDF</h3>
          <input 
            type="file" 
            id="ai-upload" 
            accept="image/*,.pdf,.ppt,.pptx" 
            style={{ display: 'none' }} 
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              if (file.size > 30 * 1024 * 1024) {
                setError("File is too large! (Max 30MB)");
                return;
              }
              setSelectedFile(file);
              setPasteText(''); 
              setError(null);
            }}
          />
          <label 
            htmlFor="ai-upload" 
            className="btn btn-outline" 
            style={{ 
              width: '100%', marginBottom: 24, padding: '14px', fontSize: 13, 
              textAlign: 'center', cursor: 'pointer', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', gap: 8,
              borderColor: selectedFile ? 'var(--gold)' : 'var(--accent-border)',
              color: selectedFile ? 'var(--gold)' : 'var(--accent)'
            }}
          >
            {selectedFile ? '✓ ' + selectedFile.name.substring(0, 15) + '...' : 'Choose File...'}
          </label>

          <div className="divider" style={{ margin: '20px 0' }} />

          <h3 style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 12 }}>GENERATION OPTIONS</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button 
              className="btn btn-primary" 
              onClick={() => handleGenerate('summary')}
              disabled={loading}
              style={{ padding: '14px', justifyContent: 'center' }}
            >
              <MdFormatListBulleted size={18} /> Summarize
            </button>
            <button 
              className="btn btn-outline" 
              onClick={() => handleGenerate('quiz')}
              disabled={loading}
              style={{ padding: '14px', justifyContent: 'center' }}
            >
              <MdOutlineQuiz size={18} /> AI Quiz
            </button>
            <button 
              className="btn btn-ghost" 
              onClick={() => handleGenerate('flashcards')}
              disabled={loading}
              style={{ padding: '14px', justifyContent: 'center', border: '1px solid var(--border)' }}
            >
              <BsCardText size={18} /> Flashcards
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="card" style={{ padding: 32, minHeight: 400, animation: 'fadeIn 0.4s ease 0.2s both' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent)' }}>
              <div className="spinner" style={{ borderTopColor: 'var(--accent)', animationDuration: '0.8s', width: 40, height: 40, marginBottom: 20 }}></div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: 2 }}>PROCESSING...</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{loadingStep}</div>
            </div>
          ) : error ? (
            <div style={{ padding: 20, background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, color: '#ffaaaa' }}>
              <h3 style={{ fontSize: 14, marginBottom: 8, color: '#ff4444' }}>Task Failed</h3>
              <p style={{ fontSize: 13 }}>{error}</p>
            </div>
          ) : (
            <div>
              {/* Tab Navigation */}
              <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 24 }}>
                {['summary', 'flashcards', 'quiz'].map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{ 
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700, letterSpacing: 2,
                      color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                      opacity: results[tab] ? 1 : 0.3,
                      textTransform: 'uppercase'
                    }}
                    disabled={!results[tab]}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {!results.summary && !results.quiz && !results.flashcards && (
                <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-muted)' }}>
                  <MdLibraryBooks size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                  <p style={{ fontSize: 14 }}>Use the sidebar to provide a lesson and generate materials.</p>
                </div>
              )}

              {activeTab === 'summary' && results.summary && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {formatSummary(results.summary)}
                </div>
              )}

              {activeTab === 'flashcards' && results.flashcards && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                  {results.flashcards.map((fc, i) => (
                    <div 
                      key={i} 
                      onClick={() => toggleFlashcard(i)}
                      style={{
                        background: flippedCards[i] ? 'var(--bg-deep)' : 'var(--bg-card)',
                        border: `1px solid ${flippedCards[i] ? 'var(--gold)' : 'var(--border)'}`,
                        borderRadius: 12, padding: 24, cursor: 'pointer',
                        minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: flippedCards[i] ? 'scale(1.02)' : 'scale(1)'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12 }}>
                          {flippedCards[i] ? 'INFO' : 'TERM'}
                        </div>
                        <div style={{ fontSize: flippedCards[i] ? 14 : 16, fontWeight: flippedCards[i] ? 400 : 700, color: flippedCards[i] ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                          {flippedCards[i] ? fc.back : fc.front}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'quiz' && results.quiz && (
                <div>
                  {results.quiz.map((q, i) => (
                    <div key={i} style={{ marginBottom: 32 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
                        <span style={{ color: 'var(--accent)', marginRight: 8 }}>{i + 1}.</span> {q.question}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16 }}>
                        {q.options.map((opt, oIdx) => {
                          let bg = 'rgba(255,255,255,0.03)';
                          let border = 'var(--border)';
                          let color = 'var(--text-secondary)';
                          
                          if (quizAnswers[i] === opt) {
                            if (!quizSubmitted) {
                              bg = 'rgba(0,170,255,0.1)';
                              border = '#00aaff';
                              color = '#00aaff';
                            } else {
                              if (opt === q.answer) {
                                bg = 'rgba(0,255,136,0.1)';
                                border = '#00ff88';
                                color = '#00ff88';
                              } else {
                                bg = 'rgba(255,68,68,0.1)';
                                border = '#ff4444';
                                color = '#ffaaaa';
                              }
                            }
                          } else if (quizSubmitted && opt === q.answer) {
                            bg = 'rgba(0,255,136,0.1)';
                            border = '#00ff88';
                            color = '#00ff88';
                          }

                          return (
                            <div 
                              key={oIdx}
                              onClick={() => selectQuizAnswer(i, opt)}
                              style={{
                                padding: '12px 16px', borderRadius: 8, fontSize: 13, cursor: quizSubmitted ? 'default' : 'pointer',
                                background: bg, border: `1px solid ${border}`, color: color,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {opt}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {quizSubmitted ? (
                      <div style={{ fontSize: 16, fontWeight: 700 }}>
                        Score: <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 24 }}>{checkQuizScore()} / {results.quiz.length}</span>
                      </div>
                    ) : (
                      <div />
                    )}
                    <button 
                      className="btn btn-primary"
                      onClick={() => setQuizSubmitted(true)}
                      disabled={quizSubmitted || Object.keys(quizAnswers).length < results.quiz.length}
                    >
                      {quizSubmitted ? 'REVIEWING' : 'SUBMIT QUIZ'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="modal-overlay" onClick={() => setShowPasteModal(false)}>
          <div className="modal" style={{ padding: 32 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--accent)', letterSpacing: 2 }}>PASTE LESSON TEXT</h2>
              <button onClick={() => setShowPasteModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
            <textarea 
              className="input"
              placeholder="Paste the full text of your lesson here..."
              style={{ width: '100%', minHeight: 300, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                if (e.target.value.trim()) setSelectedFile(null);
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-ghost" onClick={() => setShowPasteModal(false)}>CANCEL</button>
              <button className="btn btn-primary" onClick={() => setShowPasteModal(false)}>SAVE TEXT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
