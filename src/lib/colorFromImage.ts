"use client";

/** Samples an image's pixels and returns a representative colour as a hex
 * string — used to suggest an accent colour lifted straight from a YouTube
 * channel's own avatar, rather than making someone eyeball a colour wheel to
 * match their brand. Near-white/near-black/near-grey pixels (background
 * fill, rim-light edges) are skipped so they don't wash out whatever colour
 * is actually distinctive about the image. Resolves null instead of
 * throwing if the image can't be read into a canvas (e.g. the host doesn't
 * send a permissive CORS header) — this is only ever a "nice to have"
 * suggestion, never something a caller should have to handle as an error. */
export async function averageColorFromImageUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          if (pa < 200) continue;
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          if (max > 240 && min > 220) continue; // near-white
          if (max < 20) continue; // near-black
          if (max - min < 12) continue; // near-grey
          r += pr; g += pg; b += pb; count++;
        }

        if (count === 0) {
          // Every pixel got filtered out (a near-monochrome avatar) — fall
          // back to a plain average across everything rather than nothing.
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
        }
        if (count === 0) return resolve(null);

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        resolve(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
