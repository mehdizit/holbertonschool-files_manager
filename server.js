const express = require('express');
const cRouting = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

cRouting(app);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
