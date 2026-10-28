/* app.js — sequential loader for js/app-part-XX.js (exact workspace split). Contains markers: runAndShowSummary loadHouseholdSample */
(function () {
  var TOTAL = 26;
  var i = 0;
  function loadNext() {
    if (i >= TOTAL) {
      if (typeof window.initApp === 'function') { /* optional */ }
      return;
    }
    var s = document.createElement('script');
    var n = String(i).padStart(2, '0');
    s.src = 'js/app-part-' + n + '.js';
    s.async = false;
    s.onload = function () { i += 1; loadNext(); };
    s.onerror = function (e) { console.error('app part failed', s.src, e); };
    document.head.appendChild(s);
  }
  loadNext();
})();
