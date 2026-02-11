// Simple Canvas UI toolkit: buttons, panels, hit zones
export const createUi = (canvas) => {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  // Polyfill for roundRect on older browsers
  if (!ctx.roundRect) {
    ctx.roundRect = function(x, y, w, h, r) {
      const rr = Array.isArray(r) ? r[0] : r;
      const rad = Math.max(0, Math.min(rr || 0, Math.min(w, h) / 2));
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
    };
  }


  const ui = {
    ctx,
    w: 0, h: 0, dpr: 1,
    hot: [],
    pointer: { x:0, y:0, down:false },
    inputEnabled: true,
    setSize(w,h,dpr){
      ui.w = w; ui.h = h; ui.dpr = dpr;
    },
    resetHot(){ ui.hot.length = 0; },
    addHot(x,y,w,h, fn){ if (ui.inputEnabled) ui.hot.push({x,y,w,h,fn}); },
    hit(x,y){
      for (let i=ui.hot.length-1;i>=0;i--){
        const z = ui.hot[i];
        if (x>=z.x && x<=z.x+z.w && y>=z.y && y<=z.y+z.h){
          return z;
        }
      }
      return null;
    }
  };

  // drawing helpers
  const rr = (x,y,w,h,r)=>{
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,r);
  };

  const panel = (x,y,w,h,r, fill, stroke)=>{
    rr(x,y,w,h,r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke){
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const text = (str, x, y, size=14, color="#e8eef6", align="left", base="alphabetic", weight=700)=>{
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillText(str, x, y);
  };

  const button = (label, x,y,w,h, opts={})=>{
    const {
      fill="#111827",
      stroke="rgba(148,163,184,.28)",
      color="#e8eef6",
      size=14,
      onTap=null,
      disabled=false,
      badge=null
    } = opts;

    panel(x,y,w,h,14, disabled?"rgba(17,24,39,.55)":fill, stroke);
    text(label, x+w/2, y+h/2, size, disabled?"rgba(148,163,184,.6)":color, "center", "middle", 850);

    if (badge){
      const bw = Math.max(18, badge.length*8+10);
      panel(x+w-bw-8, y+8, bw, 20, 10, "rgba(59,130,246,.9)", null);
      text(badge, x+w-8-bw/2, y+18, 12, "#0b0f14", "center", "middle", 900);
    }

    if (onTap && !disabled) ui.addHot(x,y,w,h, onTap);
  };

  const pill = (label, value, x,y,w,h)=>{
    panel(x,y,w,h,14,"rgba(15,23,42,.85)","rgba(148,163,184,.22)");
    text(label, x+12, y+18, 12, "rgba(148,163,184,.95)", "left", "middle", 700);
    text(value, x+12, y+h-16, 16, "#e8eef6", "left", "middle", 900);
  };

  const bar = (x,y,w,h, p, col, back="rgba(148,163,184,.18)")=>{
    panel(x,y,w,h,999, back, null);
    const ww = Math.max(0, Math.min(1, p)) * w;
    panel(x,y,ww,h,999, col, null);
  };

  return { ui, panel, text, button, pill, bar };
};
