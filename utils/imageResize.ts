export const MAX_IMAGE_DIMENSION = 2560;

const hasTransparency = (ctx: CanvasRenderingContext2D, w: number, h: number): boolean => {
    try {
        const data = ctx.getImageData(0, 0, w, h).data;
        // Sampla var 40:e pixel — räcker gott för att hitta genomskinlighet
        for (let i = 3; i < data.length; i += 4 * 40) {
            if (data[i] < 250) return true;
        }
        return false;
    } catch {
        return true; // Kan vi inte läsa: anta transparens, dvs behåll PNG (säkraste valet)
    }
};

/**
 * Resizes an image File in the browser if its dimensions exceed MAX_IMAGE_DIMENSION.
 * Converts non-transparent images to JPG (quality 0.85) and transparent images to PNG.
 * Safe fallback: On any error or if the resized file is larger than original, returns original file.
 */
export const resizeImageFile = async (file: File): Promise<File> => {
    try {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            return file;
        }

        const mime = file.type.toLowerCase();
        // Skip GIF (animation) and SVG (vector)
        if (mime === 'image/gif' || mime === 'image/svg+xml') {
            return file;
        }

        // Get image dimensions & bitmap/element
        let width = 0;
        let height = 0;
        let imageSource: CanvasImageSource | null = null;
        let objectUrlToRevoke: string | null = null;

        if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
            try {
                const bitmap = await createImageBitmap(file);
                width = bitmap.width;
                height = bitmap.height;
                imageSource = bitmap;
            } catch {
                // Fallback to Image element if createImageBitmap fails
            }
        }

        if (!imageSource) {
            const url = URL.createObjectURL(file);
            objectUrlToRevoke = url;
            const img = new Image();
            img.src = url;
            await new Promise((resolve, reject) => {
                img.onload = () => resolve(null);
                img.onerror = (err) => reject(err);
            });
            width = img.naturalWidth || img.width;
            height = img.naturalHeight || img.height;
            imageSource = img;
        }

        // If dimensions are within MAX_IMAGE_DIMENSION, no resize needed
        if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            if (imageSource && 'close' in imageSource && typeof (imageSource as ImageBitmap).close === 'function') {
                (imageSource as ImageBitmap).close();
            }
            return file;
        }

        // Calculate target dimensions
        let targetWidth = width;
        let targetHeight = height;

        if (width > height) {
            targetWidth = MAX_IMAGE_DIMENSION;
            targetHeight = Math.round((height * MAX_IMAGE_DIMENSION) / width);
        } else {
            targetHeight = MAX_IMAGE_DIMENSION;
            targetWidth = Math.round((width * MAX_IMAGE_DIMENSION) / height);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            if (imageSource && 'close' in imageSource && typeof (imageSource as ImageBitmap).close === 'function') {
                (imageSource as ImageBitmap).close();
            }
            return file;
        }

        ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

        const transparent = (mime === 'image/png' || mime === 'image/webp')
            ? hasTransparency(ctx, targetWidth, targetHeight)
            : false;

        // Clean up source
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        if (imageSource && 'close' in imageSource && typeof (imageSource as ImageBitmap).close === 'function') {
            (imageSource as ImageBitmap).close();
        }

        // Determine output mime type and filename
        const exportMime = transparent ? 'image/png' : 'image/jpeg';
        const quality = transparent ? undefined : 0.85;

        const blob: Blob | null = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), exportMime, quality);
        });

        if (!blob) {
            return file;
        }

        // If resized blob is larger than original file, return original file
        if (blob.size >= file.size) {
            return file;
        }

        let newFileName = file.name;
        if (!transparent && !/\.(jpg|jpeg)$/i.test(newFileName)) {
            newFileName = newFileName.replace(/\.[^/.]+$/, '') + '.jpg';
        }

        return new File([blob], newFileName, {
            type: exportMime,
            lastModified: Date.now(),
        });
    } catch (err) {
        console.warn('Image resizing failed, using original file:', err);
        return file;
    }
};
