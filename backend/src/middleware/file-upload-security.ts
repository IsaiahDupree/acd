/**
 * File Upload Security Middleware (PCT-WC-039)
 * ============================================
 *
 * Implements secure file upload validation:
 * - MIME type validation
 * - File size limits
 * - Extension whitelist
 * - File isolation/sanitization
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * File upload configuration
 */
export interface FileUploadConfig {
    /**
     * Maximum file size in bytes
     * Default: 10MB
     */
    maxFileSize?: number;

    /**
     * Allowed MIME types
     * Default: Common image and document types
     */
    allowedMimeTypes?: string[];

    /**
     * Allowed file extensions
     * Default: Common safe extensions
     */
    allowedExtensions?: string[];

    /**
     * Upload directory (must be isolated from web root)
     * Default: './uploads'
     */
    uploadDir?: string;

    /**
     * Whether to sanitize filenames
     * Default: true
     */
    sanitizeFilenames?: boolean;

    /**
     * Whether to validate file content matches MIME type
     * Default: true (deep validation)
     */
    validateContent?: boolean;

    /**
     * Whether to isolate uploaded files in subdirectories
     * Default: true
     */
    isolateFiles?: boolean;
}

const DEFAULT_CONFIG: Required<FileUploadConfig> = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
        // Images
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv',
        // Archives
        'application/zip',
        'application/x-zip-compressed',
    ],
    allowedExtensions: [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.svg',
        '.pdf',
        '.doc',
        '.docx',
        '.txt',
        '.csv',
        '.zip',
    ],
    uploadDir: './uploads',
    sanitizeFilenames: true,
    validateContent: true,
    isolateFiles: true,
};

/**
 * Get file upload configuration
 */
export function getFileUploadConfig(config?: Partial<FileUploadConfig>): Required<FileUploadConfig> {
    return { ...DEFAULT_CONFIG, ...config };
}

/**
 * File magic bytes for MIME type validation
 * First few bytes of common file types
 */
const FILE_SIGNATURES: { [key: string]: number[][] } = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'application/zip': [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06]],
};

/**
 * Validate file signature (magic bytes) matches MIME type
 */
export function validateFileSignature(filePath: string, mimeType: string): boolean {
    if (!FILE_SIGNATURES[mimeType]) {
        // No signature validation available for this type
        return true;
    }

    try {
        const buffer = Buffer.alloc(8);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, 8, 0);
        fs.closeSync(fd);

        const signatures = FILE_SIGNATURES[mimeType];
        return signatures.some(signature => {
            return signature.every((byte, index) => buffer[index] === byte);
        });
    } catch (error) {
        console.error('Error validating file signature:', error);
        return false;
    }
}

/**
 * Sanitize filename to prevent path traversal and injection attacks
 */
export function sanitizeFilename(filename: string): string {
    // Remove path components
    const basename = path.basename(filename);

    // Remove non-alphanumeric characters except dots, dashes, and underscores
    const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Prevent hidden files
    if (sanitized.startsWith('.')) {
        return 'file' + sanitized;
    }

    // Prevent empty filenames
    if (!sanitized || sanitized === '.') {
        return 'unnamed_file';
    }

    return sanitized;
}

/**
 * Generate a secure random filename while preserving extension
 */
export function generateSecureFilename(originalFilename: string): string {
    const ext = path.extname(originalFilename);
    const randomName = crypto.randomBytes(16).toString('hex');
    return `${randomName}${ext}`;
}

/**
 * Create isolated upload directory structure
 */
export function createIsolatedUploadDir(baseDir: string, userId?: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    let uploadPath = path.join(baseDir, String(year), month, day);

    if (userId) {
        uploadPath = path.join(uploadPath, userId);
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true, mode: 0o750 });
    }

    return uploadPath;
}

/**
 * Validate file upload
 */
export interface FileValidationResult {
    valid: boolean;
    errors: string[];
    sanitizedFilename?: string;
    targetPath?: string;
}

export function validateFileUpload(
    file: {
        originalname: string;
        mimetype: string;
        size: number;
        path?: string;
    },
    config?: Partial<FileUploadConfig>,
    userId?: string
): FileValidationResult {
    const cfg = getFileUploadConfig(config);
    const errors: string[] = [];

    // 1. Check file size (PCT-WC-039: Size limit)
    if (file.size > cfg.maxFileSize) {
        errors.push(`File size ${file.size} bytes exceeds maximum ${cfg.maxFileSize} bytes`);
    }

    // 2. Check MIME type (PCT-WC-039: MIME check)
    if (!cfg.allowedMimeTypes.includes(file.mimetype)) {
        errors.push(`MIME type ${file.mimetype} is not allowed`);
    }

    // 3. Check file extension (PCT-WC-039: Whitelist)
    const ext = path.extname(file.originalname).toLowerCase();
    if (!cfg.allowedExtensions.includes(ext)) {
        errors.push(`File extension ${ext} is not allowed`);
    }

    // 4. Validate file content matches MIME type (deep validation)
    if (cfg.validateContent && file.path) {
        if (!validateFileSignature(file.path, file.mimetype)) {
            errors.push('File content does not match declared MIME type');
        }
    }

    // 5. Sanitize filename
    let sanitizedFilename = file.originalname;
    if (cfg.sanitizeFilenames) {
        sanitizedFilename = sanitizeFilename(file.originalname);
    }

    // 6. Generate secure filename and isolated path (PCT-WC-039: Isolation)
    let targetPath: string | undefined;
    if (cfg.isolateFiles) {
        const uploadDir = createIsolatedUploadDir(cfg.uploadDir, userId);
        const secureFilename = generateSecureFilename(sanitizedFilename);
        targetPath = path.join(uploadDir, secureFilename);
    } else {
        targetPath = path.join(cfg.uploadDir, sanitizeFilename(file.originalname));
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitizedFilename,
        targetPath,
    };
}

/**
 * Express middleware for file upload validation
 */
export function fileUploadValidator(config?: Partial<FileUploadConfig>) {
    return (req: Request, res: Response, next: NextFunction) => {
        // Check if request has file(s)
        const files = (req as any).files || (req as any).file;

        if (!files) {
            // No files to validate, continue
            return next();
        }

        // Handle single file
        if (!Array.isArray(files) && files.path) {
            const file = files;
            const userId = (req as any).user?.userId;
            const validation = validateFileUpload(file, config, userId);

            if (!validation.valid) {
                // Delete uploaded file if validation fails
                if (file.path) {
                    fs.unlinkSync(file.path);
                }

                return res.status(400).json({
                    error: {
                        code: 'FILE_VALIDATION_FAILED',
                        message: 'File validation failed',
                        details: validation.errors,
                    },
                });
            }

            // Attach validation result to request
            (req as any).fileValidation = validation;
        }

        // Handle multiple files
        if (Array.isArray(files)) {
            const userId = (req as any).user?.userId;
            const validations = files.map(file => validateFileUpload(file, config, userId));
            const failedValidations = validations.filter(v => !v.valid);

            if (failedValidations.length > 0) {
                // Delete all uploaded files if any validation fails
                files.forEach(file => {
                    if (file.path) {
                        fs.unlinkSync(file.path);
                    }
                });

                return res.status(400).json({
                    error: {
                        code: 'FILE_VALIDATION_FAILED',
                        message: 'File validation failed',
                        details: failedValidations.flatMap(v => v.errors),
                    },
                });
            }

            // Attach validation results to request
            (req as any).fileValidations = validations;
        }

        next();
    };
}

/**
 * Utility to get safe file path for serving files
 * Prevents path traversal attacks
 */
export function getSafeFilePath(baseDir: string, requestedPath: string): string | null {
    // Resolve paths to absolute
    const absoluteBaseDir = path.resolve(baseDir);
    const absoluteRequestedPath = path.resolve(baseDir, requestedPath);

    // Check if requested path is within base directory
    if (!absoluteRequestedPath.startsWith(absoluteBaseDir)) {
        return null; // Path traversal attempt
    }

    // Check if file exists
    if (!fs.existsSync(absoluteRequestedPath)) {
        return null;
    }

    return absoluteRequestedPath;
}

/**
 * Export file upload security utilities
 */
export const fileUploadSecurity = {
    validateFileUpload,
    validateFileSignature,
    sanitizeFilename,
    generateSecureFilename,
    createIsolatedUploadDir,
    getSafeFilePath,
    fileUploadValidator,
};
