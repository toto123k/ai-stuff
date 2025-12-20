import { S3Client } from "@aws-sdk/client-s3";

// Environment variables for S3 configuration
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:4566";
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "test";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "test";

// S3 bucket name
export const S3_BUCKET = process.env.S3_BUCKET || "my-dev-bucket";

// Create S3 client with LocalStack configuration for development
export const s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
    },
    // forcePathStyle is required for LocalStack
    forcePathStyle: true,
});

export { S3_ENDPOINT, S3_REGION };
