'use strict';

function success(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function failure(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

module.exports = { success, failure };
