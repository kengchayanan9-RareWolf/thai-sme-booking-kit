/**
 * LINE Messaging API. Reply messages are free and unlimited; push messages count against the
 * LINE OA monthly quota — only reminders, owner alerts and owner-approved confirmations push.
 */

function lineApi_(path, payload) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot' + path, {
    method: payload ? 'post' : 'get',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code >= 300) {
    log_('WARN', 'line ' + path, code + ' ' + res.getContentText().slice(0, 500));
    return null;
  }
  const body = res.getContentText();
  return body ? JSON.parse(body) : {};
}

function reply_(replyToken, messages) {
  return lineApi_('/message/reply', { replyToken: replyToken, messages: messages });
}

function push_(to, messages) {
  if (!to) return null;
  return lineApi_('/message/push', { to: to, messages: messages });
}

function startLoading_(userId) {
  lineApi_('/chat/loading/start', { chatId: userId, loadingSeconds: 20 });
}

function getMessageContent_(messageId) {
  const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + messageId + '/content', {
    headers: { Authorization: 'Bearer ' + prop_('LINE_CHANNEL_ACCESS_TOKEN') },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('LINE content ' + res.getResponseCode());
  return res.getBlob().setName('slip.jpg');
}

/** { limit: number|null (null = unlimited), used: number } */
function quota_() {
  const q = lineApi_('/message/quota');
  const c = lineApi_('/message/quota/consumption');
  return {
    limit: q && q.type === 'limited' ? Number(q.value) : null,
    used: c ? Number(c.totalUsage) : 0
  };
}

function alertOwner_(text) {
  const cfg = settings_();
  const via = String(cfg.owner_alert_via || 'line').toLowerCase();
  if (via.indexOf('line') !== -1 || via === 'both') {
    String(cfg.owner_line_user_id || '').split(',').map((s) => s.trim()).filter(Boolean)
      .forEach((id) => push_(id, [text_(text)]));
  }
  if ((via.indexOf('email') !== -1 || via === 'both') && cfg.owner_email) {
    MailApp.sendEmail(String(cfg.owner_email), '[' + cfg.shop_name + '] แจ้งเตือนระบบจอง', text);
  }
}

function liffUrl_(cfg) {
  return cfg.liff_id ? 'https://liff.line.me/' + cfg.liff_id : String(cfg.site_url || '');
}
