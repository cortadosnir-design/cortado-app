// Fills every [data-hours="v"] from window.HOURS using <template id="row-v">.
// Placeholders in the row template: {day} {short} {times} (times joined by
// the element's data-join, default " · "). {week} is filled anywhere in [data-week].
(function () {
  const H = window.HOURS;
  if (!H) { document.body.style.outline = "12px solid red"; return; }
  document.querySelectorAll("[data-week]").forEach(e => { e.innerHTML = e.textContent.replace("{week}", `<span class="t">${H.week}</span>`); });
  document.querySelectorAll("[data-hours]").forEach(box => {
    const tpl = document.getElementById("row-" + box.dataset.hours);
    const join = box.dataset.join || " · ";
    let days = H.days;
    if (box.dataset.group === "1") {
      // merge consecutive days with identical times: "ראשון–חמישי"
      days = [];
      H.days.forEach(d => {
        const last = days[days.length - 1];
        if (last && last.times.join() === d.times.join()) { last.to = d; }
        else days.push({ ...d });
      });
      days = days.map(d => d.to ? { ...d, day: d.day + "–" + d.to.day, short: d.short + "–" + d.to.short } : d);
    }
    box.innerHTML = days.map(d => tpl.innerHTML
      .replaceAll("{day}", d.day).replaceAll("{short}", d.short)
      .replaceAll("{times}", d.times.map(t => `<span class="t">${t}</span>`).join(join))).join("");
  });
})();
