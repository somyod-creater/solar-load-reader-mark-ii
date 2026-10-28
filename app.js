/* app.js — fetch+eval loader for js/app-part-XX.js (parts are byte chunks, not standalone scripts) */
(function () {
  var TOTAL = 26;
  var parts = [];
  function fail(e) {
    console.error(e);
    if (document.body) document.body.setAttribute('data-app-load-error', String(e));
  }
  function loadAll(i) {
    if (i >= TOTAL) {
      try {
        var code = parts.join('');
        var blob = new Blob([code], { type: 'text/javascript' });
        var s = document.createElement('script');
        s.src = URL.createObjectURL(blob);
        s.onerror = function (e) { fail(e); };
        document.head.appendChild(s);
      } catch (e) { fail(e); }
      return;
    }
    var n = String(i).padStart(2, '0');
    fetch('js/app-part-' + n + '.js', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('app part ' + n + ' HTTP ' + r.status);
        return r.text();
      })
      .then(function (t) {
        parts.push(t);
        loadAll(i + 1);
      })
      .catch(fail);
  }
  loadAll(0);
})();
