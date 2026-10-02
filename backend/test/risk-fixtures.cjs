const { VERSION } = require('../bank/risk-questionnaire');
// Synthetic test answers only. Never a suggested way for users to obtain a grade.
const HIGH = ['B','E','D','D','E','D','D','D','C','E','E'];
const LOW = ['E','A','A','A','A','A','A','A','A','A','A'];
const MID = ['B','C','C','C','C','C','C','B','B','C','C'];
const NO_LOSS = HIGH.map((a,i) => i === 5 ? 'A' : a);
const SHORT = HIGH.map((a,i) => i === 7 ? 'A' : a);
module.exports = { VERSION, HIGH, LOW, MID, NO_LOSS, SHORT };
