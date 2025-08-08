// =============================================================================
// REAL GROUND TRUTH EVALUATION RESULTS
// Generated on: 2025-06-08T17:02:42.990Z
// Based on ACTUAL article content (not mock data)
// =============================================================================

  const EVALUATION_RESULTS = [
    {
      "article_id": "001",
      "title": "Angebliches Koks-Video und Fake-Webseite: Merz im Visier russischer Desinformation",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 95,
      "is_correct": true,
      "confidence_bracket": "90-100%",
      "evaluation_date": "2025-06-08T17:02:11.858Z",
      "content_length": 6570
    },
    {
      "article_id": "002",
      "title": "Düsseldorf: Tödlicher Unfall von Rheinbahn mit Kind liegt Jahrzehnte zurück",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 85,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:16.681Z",
      "content_length": 7469
    },
    {
      "article_id": "003",
      "title": "Geplante Russland-Sanktionen der EU zielen auch auf Einflussnahme in Deutschland",
      "ground_truth": "RELIABLE",
      "openai_verdict": "QUESTIONABLE",
      "openai_confidence": 70,
      "is_correct": false,
      "confidence_bracket": "70-80%",
      "evaluation_date": "2025-06-08T17:02:20.968Z",
      "content_length": 7335
    },
    {
      "article_id": "004",
      "title": "Warum der WHO-Pandemievertrag die nationale Souveränität nicht einschränkt",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 85,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:25.358Z",
      "content_length": 6627
    },
    {
      "article_id": "005",
      "title": "Merz bei Trump: Welche Falschbehauptungen Trump über Deutschland und Europa aufstellte",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 85,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:30.363Z",
      "content_length": 7056
    },
    {
      "article_id": "006",
      "title": "Zurückweisungen an der Grenze: Was sagen Fachleute zu Dobrindts Aussagen?",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 85,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:34.244Z",
      "content_length": 8981
    },
    {
      "article_id": "007",
      "title": "Wie mit einem KI-Bild Stimmung gegen den „Helden von Hamburg gemacht wird",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 90,
      "is_correct": true,
      "confidence_bracket": "90-100%",
      "evaluation_date": "2025-06-08T17:02:36.714Z",
      "content_length": 7801
    },
    {
      "article_id": "008",
      "title": "Messerangriff in Hamburg: Verdächtige in Niedersachsen geboren",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 85,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:38.213Z",
      "content_length": 3734
    },
    {
      "article_id": "009",
      "title": "Nein, Annalena Baerbock hat Ende Mai 2025 keine Absage für neuen UN-Job erhalten",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 80,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:40.897Z",
      "content_length": 4181
    },
    {
      "article_id": "010",
      "title": "„Ende ihrer Karriere? Hinter diesen Werbeanzeigen über Alice Weidel steckt Betrug",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 86,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:41.295Z",
      "content_length": 7904
    },
    {
      "article_id": "011",
      "title": "Is Harvard refusing to tell Trump administration who its international students are? That's False",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 78,
      "is_correct": true,
      "confidence_bracket": "70-80%",
      "evaluation_date": "2025-06-08T17:02:41.737Z",
      "content_length": 4984
    },
    {
      "article_id": "012",
      "title": "Stephen Miller said courts can't rule on Trump's immigration actions. Legal experts say he's wrong.",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 85,
      "is_correct": true,
      "confidence_bracket": "80-90%",
      "evaluation_date": "2025-06-08T17:02:42.188Z",
      "content_length": 5942
    },
    {
      "article_id": "013",
      "title": "Is Trump right that immigrants in U.S. illegally have different due process standards? That's False",
      "ground_truth": "RELIABLE",
      "openai_verdict": "RELIABLE",
      "openai_confidence": 72,
      "is_correct": true,
      "confidence_bracket": "70-80%",
      "evaluation_date": "2025-06-08T17:02:42.977Z",
      "content_length": 8718
    }
  ];


// Calculate calibration statistics
function calculateCalibration() {
  const brackets = {
    '90-100%': { correct: 0, total: 0 },
    '80-90%': { correct: 0, total: 0 },
    '70-80%': { correct: 0, total: 0 },
    '60-70%': { correct: 0, total: 0 },
    'under-60%': { correct: 0, total: 0 }
  };
  
  EVALUATION_RESULTS.forEach(result => {
    if (result.confidence_bracket && result.confidence_bracket !== 'ERROR') {
      brackets[result.confidence_bracket].total++;
      if (result.is_correct) {
        brackets[result.confidence_bracket].correct++;
      }
    }
  });
  
  // Calculate accuracy for each bracket
  Object.keys(brackets).forEach(bracket => {
    const data = brackets[bracket];
    data.accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
  });
  
  return brackets;
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EVALUATION_RESULTS, calculateCalibration };
}