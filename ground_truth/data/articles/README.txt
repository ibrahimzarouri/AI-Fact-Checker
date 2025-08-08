 FactChecker Ground Truth Dataset

 Overview

This dataset contains 13 manually labeled articles used as ground truth for evaluating the performance of the FactChecker Chrome extension. The articles are professionally fact-checked pieces from reputable organizations, providing a reliable baseline for testing AI-based fact-checking systems.

 Dataset Composition

 Source Distribution
- CORRECTIV Articles (001-010): 10 German fact-checking articles
- PolitiFact Articles (011-013): 3 English fact-checking articles

 Content Categories
- Disinformation & Media Manipulation: 4 articles
- Political Claims & Policy: 5 articles  
- Social Media Scams: 2 articles
- Legal & Constitutional Issues: 2 articles

 Geographic Focus
- Germany: 10 articles (German politics, EU policy, social issues)
- United States: 3 articles (immigration law, constitutional rights)

 Article Structure

Each article follows a standardized JSON schema:

```json
{
  "article_id": "unique_identifier",
  "url": "source_url",
  "title": "article_title", 
  "content": "full_article_text",
  "date_added": "YYYY-MM-DD",
  "labeler": "human_identifier",
  "overall_assessment": {
    "reliability": "TRUE|FALSE|MIXED|MOSTLY_TRUE|MOSTLY_FALSE",
    "confidence": "HIGH|MEDIUM|LOW",
    "rationale": "explanation"
  },
  "claims": [
    {
      "claim_id": "unique_claim_id",
      "text": "specific_claim",
      "label": "true|false|misleading|unverifiable",
      "evidence_sources": ["source1", "source2"],
      "confidence": "high|medium|low",
      "notes": "additional_context"
    }
  ],
  "metadata": {
    "domain": "topic_area",
    "source_type": "content_type",
    "word_count": number,
    "complexity": "simple|moderate|complex",
    "language": "german|english"
  }
}
```

 Labeling Methodology

 Overall Assessment Criteria
- TRUE: Factually accurate with reliable sources and proper journalistic standards
- Confidence Levels: Based on source credibility, evidence quality, and verification methods

 Claim-Level Analysis
- Individual Claims: 3-6 specific factual claims extracted per article
- Evidence Requirements: Minimum 2 independent sources per claim when possible
- Verification Standards: Cross-referenced with official sources, expert statements, and documented evidence

 Quality Assurance
- All articles are from recognized fact-checking organizations (CORRECTIV, PolitiFact)
- Claims verified against primary sources (government data, court documents, official statements)
- Transparent documentation of evidence and reasoning

 Dataset Statistics

| Metric | Value |
|--------|-------|
| Total Articles | 13 |
| German Articles | 10 |
| English Articles | 3 |
| Total Claims Analyzed | 67 |
| Average Claims per Article | 5.2 |
| Average Word Count | 1,356 |
| Reliability: TRUE | 13 (100%) |
| Confidence: HIGH | 13 (100%) |

 Source Organizations

 CORRECTIV (Germany)
- Type: Non-profit investigative journalism and fact-checking organization
- Credibility: High - established reputation for thorough research
- Articles: 001-010
- Languages: German

 PolitiFact (United States)  
- Type: Pulitzer Prize-winning fact-checking organization
- Credibility: High - recognized leader in political fact-checking
- Articles: 011-013
- Languages: English

 Usage Guidelines

 For AI System Evaluation
1. Use articles as test cases for fact-checking algorithms
2. Compare AI assessments with ground truth labels
3. Measure performance on claim-level and article-level accuracy
4. Test across different domains and languages

 Performance Metrics
- Overall Accuracy: Percentage of correct reliability assessments
- Claim-Level Precision/Recall: Performance on individual claims
- Confidence Calibration: How well AI confidence correlates with accuracy
- Cross-linguistic Performance: Accuracy differences between German and English

 Evaluation Best Practices
- Test on both overall article assessment and individual claims
- Consider confidence scores in evaluation metrics
- Account for language and domain differences
- Use metadata for stratified analysis

 Dataset Limitations

 Size Constraints
- Small initial dataset (13 articles) - suitable for pilot testing
- Limited domain coverage - focus on political and social topics
- Geographic bias toward German and US contexts

 Selection Bias
- All articles are "TRUE" - lacks examples of false or mixed reliability
- Professional fact-checking sources only - may not represent typical web content
- Recent content (2025) - limited historical representation

 Labeling Considerations
- Manual labeling by single annotator - no inter-rater reliability testing
- Potential labeler bias toward fact-checking organization perspectives
- Language expertise required for German content validation

 Expansion Plans

 Phase 2 (Target: 50+ articles)
- Add FALSE and MIXED reliability examples
- Include more diverse source types (blogs, social media, opinion pieces)
- Expand geographic and topic coverage
- Implement multi-labeler validation

 Phase 3 (Target: 100+ articles)
- Balanced distribution across reliability categories
- Multiple languages and cultural contexts
- Specialized domains (health, science, finance)
- Community validation and crowdsourced verification

 File Structure

```
ground_truth/
├── data/
│   └── articles/
│       ├── article_001.json (CORRECTIV - Russian disinformation)
│       ├── article_002.json (CORRECTIV - Viral video fact-check)
│       ├── article_003.json (CORRECTIV - EU sanctions reporting)
│       ├── article_004.json (CORRECTIV - WHO treaty claims)
│       ├── article_005.json (CORRECTIV - Trump false claims)
│       ├── article_006.json (CORRECTIV - Border policy analysis)
│       ├── article_007.json (CORRECTIV - AI image manipulation)
│       ├── article_008.json (CORRECTIV - Hamburg attack misinformation)
│       ├── article_009.json (CORRECTIV - Cryptocurrency scam ads)
│       ├── article_010.json (CORRECTIV - UN position claims)
│       ├── article_011.json (PolitiFact - Harvard immigration claim)
│       ├── article_012.json (PolitiFact - Court jurisdiction claim)
│       └── article_013.json (PolitiFact - Due process rights)
└── README.md
```

 Version History

- v1.0 (June 2025): Initial dataset with 13 articles
- Focus on establishing methodology and structure
- Proof of concept for FactChecker extension evaluation

 License and Attribution

This dataset contains copyrighted content from CORRECTIV and PolitiFact used for research purposes. The ground truth labels and analysis structure are available for academic and development use. Please cite original sources when using this data.

---

*Last updated: June 7, 2025*