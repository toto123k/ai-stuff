import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "../lib/s3/client";

const setupS3 = async () => {
    console.log("🪣 Setting up S3 bucket...\n");

    // Check existing buckets
    const listResponse = await s3Client.send(new ListBucketsCommand({}));
    const existingBuckets = listResponse.Buckets?.map((b) => b.Name) || [];

    if (existingBuckets.includes(S3_BUCKET)) {
        console.log(`✅ Bucket "${S3_BUCKET}" already exists`);
    } else {
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
        console.log(`✅ Created bucket "${S3_BUCKET}"`);
    }

    console.log("\n📋 Current buckets:");
    const updatedList = await s3Client.send(new ListBucketsCommand({}));
    updatedList.Buckets?.forEach((b) => console.log(`   - ${b.Name}`));

    console.log("\n🚀 S3 is ready!");
};

setupS3().catch(console.error);
