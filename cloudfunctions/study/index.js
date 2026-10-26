'use strict';
const { createStudy } = require('./application');
exports.main = createStudy(require('wx-server-sdk'));
