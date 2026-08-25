/*
 * Плавные табы: под активной вкладкой едет пилюля-слайдер (эффект как у AnimatedTabs,
 * но на чистом JS — без React). Работает поверх существующей логики switchTab/setSessionMode:
 * ничего не ломает, только добавляет визуальный слайдер и следит за классом .active.
 * Подключать после разметки: <script src="js/animated-tabs.js"></script>
 */
(function () {
  var TAB_SEL = '.tab, .mode-btn';

  function initBar(bar) {
    if (bar.__sliderInit) return;
    bar.__sliderInit = true;
    bar.style.position = 'relative';

    var slider = document.createElement('div');
    slider.className = 'tab-slider';
    bar.insertBefore(slider, bar.firstChild);

    function activeTab() {
      return bar.querySelector('.tab.active, .mode-btn.active') || bar.querySelector(TAB_SEL);
    }

    function move(animate) {
      var t = activeTab();
      if (!t) { slider.style.opacity = '0'; return; }
      slider.style.opacity = '1';
      if (!animate) slider.style.transition = 'none';
      slider.style.width = t.offsetWidth + 'px';
      slider.style.transform = 'translateX(' + t.offsetLeft + 'px)';
      if (!animate) {
        // форсируем reflow, чтобы вернуть transition без анимации стартовой позиции
        void slider.offsetWidth;
        slider.style.transition = '';
      }
      // подскроллить активную вкладку в видимую зону (если полоса скроллится)
      if (typeof t.scrollIntoView === 'function') {
        try { t.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {}
      }
    }

    var tabs = bar.querySelectorAll(TAB_SEL);
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        // switchTab/setSessionMode поставят .active — двигаем после кадра
        requestAnimationFrame(function () { move(true); });
      });
    }

    // На случай если .active переключают из кода (не по клику) — следим за классом
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { move(true); });
      for (var j = 0; j < tabs.length; j++) {
        mo.observe(tabs[j], { attributes: true, attributeFilter: ['class'] });
      }
    }

    window.addEventListener('resize', function () { move(false); });
    move(false); // стартовая позиция без анимации
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { move(false); }); // после загрузки шрифтов ширина точнее
    }
  }

  function initAll() {
    var bars = document.querySelectorAll('.tabs, .mode-switch');
    for (var i = 0; i < bars.length; i++) initBar(bars[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
