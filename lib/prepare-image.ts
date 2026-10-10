const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_EDGE = 1600;
const OPERATION_TIMEOUT_MS = 15_000;
const QUALITIES = [0.86, 0.72, 0.56, 0.42];

type ImageMime = "image/png" | "image/jpeg" | "image/webp";

async function validateImage(file: File): Promise<void> {
  if (!file.size || file.size > MAX_INPUT_BYTES) {
    throw new Error("Escolha uma imagem de até 10 MB.");
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma imagem PNG, JPEG ou WebP.");
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = file.type === "image/png"
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => header[i] === value)
    : file.type === "image/jpeg"
      ? header[0] === 255 && header[1] === 216 && header[2] === 255
      : String.fromCharCode(...header.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!matches) {
    throw new Error("O conteúdo deste arquivo não corresponde ao formato da imagem.");
  }
}

function loadImage(image: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error(
      "A imagem demorou demais para abrir. Tente uma versão menor."
    )), OPERATION_TIMEOUT_MS);
    image.onload = () => finish();
    image.onerror = () => finish(new Error(
      "Não foi possível abrir esta imagem. Escolha outro arquivo PNG, JPEG ou WebP."
    ));
    image.src = url;
  });
}

function encodeImage(canvas: HTMLCanvasElement, type: ImageMime, quality: number, deadline: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    const timeoutError = () => new Error("Não foi possível preparar a imagem a tempo. Tente uma versão menor.");
    if (remaining <= 0) {
      reject(timeoutError());
      return;
    }
    const timer = setTimeout(() => reject(timeoutError()), remaining);
    try {
      canvas.toBlob((blob) => {
        clearTimeout(timer);
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error("Não foi possível preparar esta imagem. Tente outro arquivo."));
      }, type, quality);
    } catch {
      clearTimeout(timer);
      reject(new Error("Seu navegador não conseguiu preparar esta imagem. Tente outro arquivo."));
    }
  });
}

/** Prepare only a user-selected file; never upload the unprocessed original. */
export async function prepareVisionImage(file: File): Promise<File> {
  await validateImage(file);
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Abra o aplicativo em um navegador para adicionar imagens.");
  }

  const image = new Image();
  const canvas = document.createElement("canvas");
  const url = URL.createObjectURL(file);

  try {
    await loadImage(image, url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error("Esta imagem não tem dimensões válidas. Escolha outro arquivo.");
    }
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Seu navegador não consegue preparar imagens. Tente outro navegador.");
    }

    const initialScale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;
    let outputType: ImageMime = "image/webp";

    // Lower quality first, then dimensions. Every pass redraws the original,
    // avoiding accumulated resizing artifacts and never enlarging the image.
    for (let pass = 0; pass < 7; pass += 1) {
      const scale = initialScale * 0.8 ** pass;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      const draw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (outputType === "image/jpeg") {
          // JPEG has no alpha channel: transparent areas become white.
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      draw();

      for (const quality of QUALITIES) {
        let blob = await encodeImage(canvas, outputType, quality, deadline);
        if (outputType === "image/webp" && blob.type !== "image/webp") {
          // Unsupported canvas encoders silently return PNG. Check the actual
          // MIME, then explicitly encode JPEG instead of mislabelling PNG bytes.
          outputType = "image/jpeg";
          draw();
          blob = await encodeImage(canvas, outputType, quality, deadline);
        }
        if (blob.type !== outputType) {
          throw new Error("Seu navegador não consegue compactar esta imagem. Tente outro navegador.");
        }
        if (blob.size <= MAX_OUTPUT_BYTES) {
          const stem = file.name.replace(/\.[^/.]+$/, "").replace(/[\/\\\u0000-\u001f]/g, "").trim().slice(0, 100) || "visao";
          const extension = outputType === "image/webp" ? "webp" : "jpg";
          return new File([blob], `${stem}.${extension}`, { type: outputType, lastModified: file.lastModified });
        }
      }
    }
    throw new Error("Não foi possível reduzir esta imagem para até 1 MB. Escolha outra imagem.");
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
