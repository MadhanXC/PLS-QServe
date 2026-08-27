/**
 * Client-side Image Compression Utility
 * Resizes large image files/Data URLs to an optimized JPEG format (max width/height 800px, 60% quality)
 * to keep Base64 strings compact (<50KB per photo) and prevent Firestore 1MB document limit errors.
 */

export async function compressImage(fileOrDataUrl: File | string, maxWidth = 800, maxHeight = 800, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    // If string is already small (under 80KB), resolve directly
    if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.length < 100000) {
      resolve(fileOrDataUrl);
      return;
    }

    const img = new Image();

    const processImage = () => {
      let width = img.width || 800;
      let height = img.height || 800;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(width, 1);
      canvas.height = Math.max(height, 1);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl.slice(0, 100000) : '');
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Export as compressed JPEG
      try {
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch (e) {
        console.warn('Canvas toDataURL failed during compression:', e);
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
      }
    };

    img.onerror = () => {
      console.warn('Image load error during compression');
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
      if (img.complete) {
        processImage();
      } else {
        img.onload = processImage;
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
        img.onload = processImage;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

/**
 * Compress an array of photo URLs/Base64 strings in parallel
 */
export async function compressPhotosList(photos: string[] = []): Promise<string[]> {
  if (!photos || photos.length === 0) return [];
  const compressed = await Promise.all(
    photos.map((p) => compressImage(p, 800, 800, 0.6))
  );
  return compressed;
}

