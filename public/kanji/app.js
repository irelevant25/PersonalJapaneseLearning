/* Kanji SRS — hash router and boot.
 *
 *   #/                 dashboard
 *   #/lessons          choose and start lessons
 *   #/reviews          the reviews that are due
 *   #/practice         practice (any learned item, any time)
 *   #/browse?lesson=6  every item, filterable
 *   #/item/<id>        one item: details, notes, statistics
 */
(function () {
  const KA = window.KA;
  const app = document.getElementById('app');

  function parse() {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const [path, qs] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const [name, ...rest] = path.split('/');
    return { name: name || '', arg: rest.join('/'), params };
  }

  KA.route = async function route() {
    const { name, arg, params } = parse();
    KA.markNav(name);
    try {
      // Fresh progress on every screen change: due counts move with the clock.
      await KA.refresh();
    } catch (e) {
      KA.clear(app).append(KA.h('p', { class: 'err' }, `Could not load progress: ${e.message}`));
      return;
    }
    KA.clear(app);
    window.scrollTo(0, 0);
    const V = KA.views;
    switch (name) {
      case '':
        return V.dashboard(app);
      case 'lessons':
        return V.lessons(app, params);
      case 'reviews':
        return V.reviews(app);
      case 'practice':
        return V.practice(app, params);
      case 'browse':
        return V.browse(app, params);
      case 'item':
        return V.item(app, arg);
      default:
        location.hash = '#/';
    }
  };

  window.addEventListener('hashchange', KA.route);

  // A link to the address already in the bar fires no hashchange. Sessions draw
  // over the screen they started from without changing the address (a lesson
  // started on the dashboard stays at #/), so route such a click by hand, or
  // Dashboard would do nothing at the end of that lesson.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    // any other address is a real change: the browser and hashchange take it
    if (!a || a.target || a.href !== location.href) return;
    e.preventDefault();
    KA.route();
  });

  (async function boot() {
    try {
      await KA.load();
    } catch (e) {
      KA.clear(app).append(KA.h('p', { class: 'err' }, `Could not load the kanji data: ${e.message}`));
      return;
    }
    KA.route();
    // keep the due badge honest while the tab sits open
    setInterval(() => KA.refresh().catch(() => {}), 5 * 60 * 1000);
  })();
})();
