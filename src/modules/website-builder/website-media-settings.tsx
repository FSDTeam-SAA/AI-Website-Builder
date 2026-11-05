"use client";
import { useEffect, useState } from "react";
import { ImagePlus, Palette, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  koraRequest,
  type Website,
  type WebsiteAsset,
  type WebsiteBrand,
} from "@/lib/kora/client";

type Shared = {
  site: Website;
  busy: boolean;
  canWrite: boolean;
  onBusy: (value: string) => void;
  onError: (error: unknown) => void;
  onClose: () => void;
};
export function WebsiteMedia(
  props: Shared & {
    open: boolean;
    onInsert: (url: string, alt: string) => void;
  },
) {
  const [assets, setAssets] = useState<WebsiteAsset[]>([]),
    [url, setUrl] = useState(""),
    [alt, setAlt] = useState("");
  useEffect(() => {
    if (!props.open) return;
    let active = true;
    koraRequest<WebsiteAsset[]>(`websites/${props.site._id}/assets`)
      .then((data) => {
        if (active) setAssets(data);
      })
      .catch(props.onError);
    return () => {
      active = false;
    };
  }, [props.open, props.site._id, props.onError]);
  async function upload(file: File | undefined) {
    if (!file) return;
    props.onBusy("Uploading image");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(
        `/api/kora/websites/${props.site._id}/assets`,
        { method: "POST", body: form },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Image upload failed");
      setAssets((current) => [result.data, ...current]);
      setUrl(result.data.file.url);
      if (!alt) setAlt(file.name);
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
    >
      <DialogContent showCloseButton={!props.busy} className="wh-dialog wm-dialog">
        <DialogHeader>
          <DialogTitle>Website media</DialogTitle>
          <DialogDescription>
            Choose a business image, upload a new one, or use an HTTPS image
            URL. Images are inserted into the current draft.
          </DialogDescription>
        </DialogHeader>
        <div className="kw-app wh-dialog-body">
          <label className="wm-upload">
            <Upload size={15} />
            Upload image
            <input
              aria-label="Upload website image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={props.busy || !props.canWrite}
              onChange={(event) => upload(event.target.files?.[0])}
            />
            <small>PNG, JPEG or WebP · up to 5 MB</small>
          </label>
          <div className="wm-assets">
            {assets.map((asset) => (
              <button
                key={asset._id}
                aria-pressed={url === asset.file.url}
                aria-label={`Choose ${asset.name}`}
                onClick={() => {
                  setUrl(asset.file.url);
                  setAlt(asset.name);
                }}
              >
                {/* Arbitrary authorized Cloudinary/asset URLs do not use the Next image proxy. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.file.url} alt={asset.name} />
                <span>{asset.name}</span>
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              props.onInsert(url, alt);
              props.onClose();
            }}
          >
            <label>
              Image URL
              <input
                type="url"
                required
                pattern="https://.*"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://…"
              />
            </label>
            <label>
              Image description (alt text)
              <input
                required
                maxLength={300}
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
              />
            </label>
            <div className="wr-actions">
              <button type="button" onClick={props.onClose}>
                Cancel
              </button>
              <button
                className="kw-primary"
                disabled={props.busy || !props.canWrite}
              >
                <ImagePlus size={13} />
                Insert image
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WebsiteSettings(
  props: Shared & {
    open: boolean;
    canApplyTheme: boolean;
    onTheme: (css: string) => void;
    onRefresh: () => Promise<void>;
  },
) {
  const [current, setCurrent] = useState<Website | null>(null),
    [brands, setBrands] = useState<WebsiteBrand[]>([]);
  const [name, setName] = useState(""),
    [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState(""),
    [primary, setPrimary] = useState("#cda66c"),
    [background, setBackground] = useState("#0c0e11"),
    [foreground, setForeground] = useState("#f5f3ef"),
    [font, setFont] = useState("Arial");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!props.open) return;
    let active = true;
    Promise.all([
      koraRequest<Website>(`websites/${props.site._id}`),
      koraRequest<WebsiteBrand[]>("brand-kits"),
    ])
      .then(([site, kits]) => {
        if (active) {
          setCurrent(site);
          setName(site.name);
          setBrandId(site.brandKit_id || "");
          setBrands(kits);
          setNotice("");
        }
      })
      .catch(props.onError);
    return () => {
      active = false;
    };
  }, [props.open, props.site._id, props.onError]);
  async function run(label: string, work: () => Promise<void>) {
    props.onBusy(label);
    try {
      await work();
    } catch (error) {
      props.onError(error);
    } finally {
      props.onBusy("");
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    await run("Saving website settings", async () => {
      const updated = await koraRequest<Website>(
        `websites/${current._id}`,
        "PATCH",
        { name, brandKitId: brandId || null, expectedVersion: current.__v },
      );
      setCurrent(updated);
      await props.onRefresh();
      setNotice("Website settings saved.");
    });
  }
  async function createBrand() {
    if (!brandName.trim()) {
      props.onError(new Error("Name your brand kit first."));
      return;
    }
    await run("Creating brand kit", async () => {
      const brand = await koraRequest<WebsiteBrand>("brand-kits", "POST", {
        name: brandName,
        primary,
        background,
        foreground,
        font,
      });
      setBrands((items) => [...items, brand]);
      setBrandId(brand._id);
      setNotice("Brand kit created. Save settings to use it for generation.");
    });
  }
  function applyTheme() {
    const brand = brands.find((item) => item._id === brandId);
    const color = (role: string, fallback: string) =>
      brand?.colors.find((item) => item.role === role)?.hex || fallback;
    const family = brand?.typography.body || font;
    // Brand data comes from validated backend color/font fields; keep legacy kits constrained too.
    const valid = (value: string) => /^#[a-f0-9]{6}$/i.test(value);
    const bg = color("background", background),
      fg = color("foreground", foreground),
      accent = color("primary", primary);
    if (![bg, fg, accent].every(valid) || !/^[a-zA-Z\s-]{1,50}$/.test(family)) {
      props.onError(
        new Error(
          "This brand kit needs valid hex colors and a supported font name.",
        ),
      );
      return;
    }
    props.onTheme(
      `\n/* Kora brand */\nbody{background:${bg};color:${fg};font-family:'${family}',sans-serif}h1,h2,h3,a{color:${accent}}`,
    );
    props.onClose();
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
    >
      <DialogContent showCloseButton={!props.busy} className="wh-dialog wm-dialog">
        <DialogHeader>
          <DialogTitle>Website settings & brand</DialogTitle>
          <DialogDescription>
            Keep the website identity and generation context aligned with your
            business.
          </DialogDescription>
        </DialogHeader>
        <div className="kw-app wh-dialog-body">
          {notice && (
            <p className="wh-saved" role="status">
              {notice}
            </p>
          )}
          <form onSubmit={save}>
            <label>
              Website name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Brand kit
              <select
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
              >
                <option value="">No brand kit</option>
                {brands.map((brand) => (
                  <option key={brand._id} value={brand._id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="kw-primary"
              disabled={props.busy || !props.canWrite || !current}
            >
              Save website settings
            </button>
          </form>
          <hr />
          <h3 className="wm-title">Create a brand kit</h3>
          <label>
            Brand kit name
            <input
              maxLength={120}
              value={brandName}
              onChange={(event) => setBrandName(event.target.value)}
            />
          </label>
          <div className="wm-colors">
            <label>
              Primary
              <input
                type="color"
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
              />
            </label>
            <label>
              Background
              <input
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </label>
            <label>
              Text
              <input
                type="color"
                value={foreground}
                onChange={(event) => setForeground(event.target.value)}
              />
            </label>
          </div>
          <label>
            Font
            <select
              value={font}
              onChange={(event) => setFont(event.target.value)}
            >
              {["Arial", "Georgia", "Verdana", "Tahoma", "Trebuchet MS"].map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </select>
          </label>
          <div className="wr-actions">
            <button
              disabled={props.busy || !props.canWrite}
              onClick={createBrand}
            >
              Create brand kit
            </button>
            <button
              className="kw-primary"
              disabled={props.busy || !props.canWrite || !props.canApplyTheme}
              onClick={applyTheme}
            >
              <Palette size={13} />
              Apply colors to current page
            </button>
          </div>
          <p className="wh-footnote">
            Applying colors edits the draft CSS. Save the page when you are
            happy with the result.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
