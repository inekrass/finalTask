const express = require('express');
const path = require('node:path');

const app = express();

app.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = app;

if (require.main === module) {
  app.listen(process.env.PORT || 3000);
}
