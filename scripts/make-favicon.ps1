# Rebuilds the favicon PNGs from the master art.
#
# The master export has the editor's checkerboard baked in as opaque pixels
# (24bpp, no alpha), so the background is flood-filled away from the borders
# before downscaling.

Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class FaviconTool
{
    static bool NearAny(Color c, List<Color> keys, int tol)
    {
        foreach (Color k in keys)
        {
            int dr = c.R - k.R, dg = c.G - k.G, db = c.B - k.B;
            if (dr * dr + dg * dg + db * db <= tol * tol) return true;
        }
        return false;
    }

    // Flood-fills the baked checkerboard from the image borders and returns
    // a 32bpp bitmap with those pixels made transparent.
    public static Bitmap RemoveBackdrop(Bitmap src, int tolerance, int erode)
    {
        int w = src.Width, h = src.Height;
        Bitmap dst = new Bitmap(w, h, PixelFormat.Format32bppArgb);

        Color[,] px = new Color[w, h];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                px[x, y] = src.GetPixel(x, y);

        // The checker uses two light tones; sample them from the corners.
        List<Color> keys = new List<Color>();
        Color[] corners = { px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1],
                            px[w / 2, 0], px[0, h / 2] };
        foreach (Color c in corners)
            if (!NearAny(c, keys, 12)) keys.Add(c);

        bool[,] bg = new bool[w, h];
        Queue<int> q = new Queue<int>();

        for (int x = 0; x < w; x++)
        {
            q.Enqueue(x); q.Enqueue(0);
            q.Enqueue(x); q.Enqueue(h - 1);
        }
        for (int y = 0; y < h; y++)
        {
            q.Enqueue(0); q.Enqueue(y);
            q.Enqueue(w - 1); q.Enqueue(y);
        }

        while (q.Count > 0)
        {
            int x = q.Dequeue(), y = q.Dequeue();
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            if (bg[x, y]) continue;
            if (!NearAny(px[x, y], keys, tolerance)) continue;
            bg[x, y] = true;
            q.Enqueue(x + 1); q.Enqueue(y);
            q.Enqueue(x - 1); q.Enqueue(y);
            q.Enqueue(x); q.Enqueue(y + 1);
            q.Enqueue(x); q.Enqueue(y - 1);
        }

        // Anti-aliased edges keep a pale halo; shave the light fringe pixels
        // that still touch the removed background.
        for (int pass = 0; pass < erode; pass++)
        {
            List<int> add = new List<int>();
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    if (bg[x, y]) continue;
                    bool touches =
                        (x > 0 && bg[x - 1, y]) || (x < w - 1 && bg[x + 1, y]) ||
                        (y > 0 && bg[x, y - 1]) || (y < h - 1 && bg[x, y + 1]);
                    if (!touches) continue;
                    if (NearAny(px[x, y], keys, tolerance * 2)) { add.Add(x); add.Add(y); }
                }
            }
            for (int i = 0; i < add.Count; i += 2) bg[add[i], add[i + 1]] = true;
        }

        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
                dst.SetPixel(x, y, bg[x, y] ? Color.FromArgb(0, 0, 0, 0) : px[x, y]);

        return dst;
    }
}
"@ -ReferencedAssemblies System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'src\assets\favicon-source.png'
$src = New-Object System.Drawing.Bitmap($srcPath)

$cut = [FaviconTool]::RemoveBackdrop($src, 40, 2)
$src.Dispose()

foreach ($size in 32, 180) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($cut, 0, 0, $size, $size)
  $g.Dispose()
  $out = Join-Path $root ("public\favicon-{0}.png" -f $size)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("wrote {0}" -f $out)
}

$cut.Dispose()
