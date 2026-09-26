/**
 * Web app entry point. Only the Cloudflare Worker calls this: it verifies LINE signatures and
 * LIFF ID tokens (Apps Script cannot read request headers), then forwards JSON with SHARED_SECRET.
 */

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'BAD_JSON' });
  }
  const secret = prop_('SHARED_SECRET');
  if (!secret || req.secret !== secret) return json_({ ok: false, error: 'FORBIDDEN' });

  try {
    switch (req.kind) {
      case 'webhook':
        handleWebhook_(req.body || {});
        return json_({ ok: true });
      case 'services':
        return json_({ ok: true, services: publicServices_(), shop: bookingShopInfo_() });
      case 'slots':
        return json_({ ok: true, slots: availableSlots_(req.date, req.serviceId) });
      case 'book':
        return json_(createBooking_(req));
      case 'site':
        return json_({ ok: true, site: siteData_() });
      default:
        return json_({ ok: false, error: 'UNKNOWN_KIND' });
    }
  } catch (err) {
    log_('ERROR', 'doPost:' + req.kind, err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'SERVER_ERROR' });
  }
}

function doGet() {
  return json_({ ok: true, service: 'thai-sme-booking' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleWebhook_(body) {
  const cache = CacheService.getScriptCache();
  (body.events || []).forEach((ev) => {
    try {
      // LINE may redeliver events; skip anything we've already handled in the last 6 hours.
      if (ev.webhookEventId) {
        if (cache.get(ev.webhookEventId)) return;
        cache.put(ev.webhookEventId, '1', 21600);
      }
      if (ev.mode === 'standby' || ev.type !== 'message') return;
      if (!ev.source || ev.source.type !== 'user') return; // ignore groups and rooms
      if (ev.message.type === 'text') handleText_(ev);
      else if (ev.message.type === 'image') handleImage_(ev);
    } catch (err) {
      log_('ERROR', 'webhook', err && err.stack ? err.stack : err);
    }
  });
}
