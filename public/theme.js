/* Colour theme: "light", "dark" or "system" (default), remembered on this device.
   Runs before the page paints so the chosen theme never flashes the other one. */
(function () {
  var KEY = "sf-theme",
    media = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : "system";
    } catch (e) {
      return "system";
    }
  }
  function apply() {
    var choice = saved(),
      dark = choice === "dark" || (choice === "system" && !!(media && media.matches)),
      root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.themeChoice = choice;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#141914" : "#f4f1e8");
  }
  window.sfTheme = {
    get: saved,
    set: function (choice) {
      try {
        if (choice === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, choice);
      } catch (e) {}
      apply();
    },
  };
  if (media) (media.addEventListener ? media.addEventListener("change", apply) : media.addListener(apply));
  apply();
})();
