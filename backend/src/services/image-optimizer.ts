/**
 * Image Optimization Service
 * Handles image compression, resizing, and format conversion
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
  sizes?: number[]; // Generate multiple sizes
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface OptimizedImage {
  path: string;
  url: string;
  width: number;
  height: number;
  size: number; // File size in bytes
  format: string;
}

class ImageOptimizer {
  private uploadDir: string;
  private cacheDir: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'images');
    this.cacheDir = path.join(process.cwd(), 'cache', 'images');
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Optimize a single image
   */
  async optimizeImage(
    inputPath: string,
    options: ImageOptimizationOptions = {}
  ): Promise<OptimizedImage> {
    const {
      maxWidth = 1920,
      maxHeight = 1920,
      quality = 80,
      format = 'webp',
      fit = 'inside',
    } = options;

    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Resize if needed
    let processed = image;
    if (metadata.width && metadata.width > maxWidth || metadata.height && metadata.height > maxHeight) {
      processed = processed.resize(maxWidth, maxHeight, { fit });
    }

    // Convert format and compress
    const outputFilename = this.generateFilename(inputPath, format);
    const outputPath = path.join(this.cacheDir, outputFilename);

    if (format === 'webp') {
      await processed.webp({ quality }).toFile(outputPath);
    } else if (format === 'jpeg') {
      await processed.jpeg({ quality, mozjpeg: true }).toFile(outputPath);
    } else if (format === 'png') {
      await processed.png({ quality, compressionLevel: 9 }).toFile(outputPath);
    } else if (format === 'avif') {
      await processed.avif({ quality }).toFile(outputPath);
    }

    const stats = await fs.stat(outputPath);
    const outputMetadata = await sharp(outputPath).metadata();

    return {
      path: outputPath,
      url: `/cache/images/${outputFilename}`,
      width: outputMetadata.width || 0,
      height: outputMetadata.height || 0,
      size: stats.size,
      format,
    };
  }

  /**
   * Generate responsive image sizes
   */
  async generateResponsiveSizes(
    inputPath: string,
    sizes: number[] = [320, 640, 1024, 1920],
    options: ImageOptimizationOptions = {}
  ): Promise<OptimizedImage[]> {
    const results: OptimizedImage[] = [];

    for (const width of sizes) {
      const optimized = await this.optimizeImage(inputPath, {
        ...options,
        maxWidth: width,
      });

      results.push(optimized);
    }

    return results;
  }

  /**
   * Optimize for web (multiple formats and sizes)
   */
  async optimizeForWeb(
    inputPath: string
  ): Promise<{
    webp: OptimizedImage[];
    jpeg: OptimizedImage[];
    original: OptimizedImage;
  }> {
    const sizes = [320, 640, 1024, 1920];

    const [webpImages, jpegImages, original] = await Promise.all([
      this.generateResponsiveSizes(inputPath, sizes, { format: 'webp' }),
      this.generateResponsiveSizes(inputPath, sizes, { format: 'jpeg' }),
      this.optimizeImage(inputPath, { maxWidth: 1920, format: 'webp' }),
    ]);

    return {
      webp: webpImages,
      jpeg: jpegImages,
      original,
    };
  }

  /**
   * Generate srcset string for <img> tag
   */
  generateSrcSet(images: OptimizedImage[]): string {
    return images.map((img) => `${img.url} ${img.width}w`).join(', ');
  }

  /**
   * Generate <picture> element HTML
   */
  generatePictureHTML(
    webpImages: OptimizedImage[],
    jpegImages: OptimizedImage[],
    alt: string = ''
  ): string {
    const webpSrcSet = this.generateSrcSet(webpImages);
    const jpegSrcSet = this.generateSrcSet(jpegImages);
    const fallback = jpegImages[jpegImages.length - 1];

    return `
<picture>
  <source type="image/webp" srcset="${webpSrcSet}" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw">
  <source type="image/jpeg" srcset="${jpegSrcSet}" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw">
  <img src="${fallback.url}" alt="${alt}" width="${fallback.width}" height="${fallback.height}" loading="lazy">
</picture>
    `.trim();
  }

  /**
   * Clean up old cached images
   */
  async cleanupCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const files = await fs.readdir(this.cacheDir);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stats = await fs.stat(filePath);

      const age = Date.now() - stats.mtimeMs;

      if (age > maxAgeMs) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  private generateFilename(inputPath: string, format: string): string {
    const basename = path.basename(inputPath, path.extname(inputPath));
    const timestamp = Date.now();
    return `${basename}-${timestamp}.${format}`;
  }

  /**
   * Get image dimensions without loading full image
   */
  async getImageInfo(inputPath: string) {
    const metadata = await sharp(inputPath).metadata();

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format,
      size: metadata.size || 0,
      hasAlpha: metadata.hasAlpha,
    };
  }

  /**
   * Validate image file
   */
  async validateImage(inputPath: string): Promise<boolean> {
    try {
      await sharp(inputPath).metadata();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const imageOptimizer = new ImageOptimizer();

/**
 * Express middleware for automatic image optimization
 */
import { Request, Response, NextFunction } from 'express';

export async function optimizeUploadedImages(req: Request, res: Response, next: NextFunction) {
  // This would process files from multer/formidable
  // For now, just a placeholder
  next();
}
