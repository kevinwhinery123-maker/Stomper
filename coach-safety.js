// These rules run before any optional AI request. Keep the coach in general fitness.
const medicalPattern = /\b(pain|injur(?:y|ed)|diagnos(?:e|is)|medical|medication|rehab(?:ilitation)?|physical therapy|pregnan(?:t|cy)|chest pain|dizz(?:y|iness)|faint|heart|eating disorder|anorexia|bulimia|self[- ]?harm|suicid)/i;
function isMedicalOrSensitive(text) { return medicalPattern.test(String(text || '')); }
function safetyReply() { return 'I can help with general fitness routines and planning, but I can’t assess symptoms, injuries, or medical conditions. Please pause or reduce training as appropriate and speak with a qualified healthcare professional for personalized guidance.'; }
module.exports = { isMedicalOrSensitive, safetyReply };
