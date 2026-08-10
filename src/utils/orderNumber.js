// Generates a human-friendly order number stamped in Pakistan time (UTC+5,
// no DST) regardless of what timezone the server itself runs in.
// e.g. generateOrderNumber('RC') -> "RC202607311830412345a"
//      generateOrderNumber('WD') -> "WD202607311830412345a"
function generateOrderNumber(prefix) {
  const now = new Date();
  const pktMs = now.getTime() + (5 * 60 - now.getTimezoneOffset()) * 60000;
  const pkt = new Date(pktMs);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const stamp =
    `${pkt.getUTCFullYear()}${pad(pkt.getUTCMonth() + 1)}${pad(pkt.getUTCDate())}` +
    `${pad(pkt.getUTCHours())}${pad(pkt.getUTCMinutes())}${pad(pkt.getUTCSeconds())}`;

  const rand = Math.floor(1000 + Math.random() * 9000); // 4 digits, keeps it unique under load
  const suffix = String.fromCharCode(97 + Math.floor(Math.random() * 26)); // trailing a-z

  return `${prefix}${stamp}${rand}${suffix}`;
}

module.exports = { generateOrderNumber };