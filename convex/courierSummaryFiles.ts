import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================
// COURIER SUMMARY FILE STORAGE
// Stores uploaded Excel files so they can be downloaded later.
// ============================================

/**
 * Save a record for an uploaded courier summary file.
 * Called from the HTTP handler after storing the file in Convex storage.
 */
export const saveFileRecord = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    date: v.string(),
    processedSuccessfully: v.boolean(),
    totalRows: v.optional(v.number()),
    addressGroups: v.optional(v.number()),
    grandTotal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("courierSummaryFiles", {
      storageId: args.storageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      date: args.date,
      uploadedAt: Date.now(),
      processedSuccessfully: args.processedSuccessfully,
      totalRows: args.totalRows,
      addressGroups: args.addressGroups,
      grandTotal: args.grandTotal,
    });
  },
});

/**
 * List all uploaded courier summary files, newest first.
 */
export const listFiles = query({
  args: {},
  handler: async (ctx) => {
    const files = await ctx.db
      .query("courierSummaryFiles")
      .withIndex("by_uploadedAt")
      .order("desc")
      .take(100);

    // Attach download URLs
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const url = await ctx.storage.getUrl(file.storageId);
        return { ...file, downloadUrl: url };
      })
    );

    return filesWithUrls;
  },
});

/**
 * Get a download URL for a specific file.
 */
export const getFileUrl = query({
  args: { fileId: v.id("courierSummaryFiles") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) return null;
    const url = await ctx.storage.getUrl(file.storageId);
    return { ...file, downloadUrl: url };
  },
});

/**
 * Delete a stored file and its record.
 */
export const deleteFile = mutation({
  args: { fileId: v.id("courierSummaryFiles") },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");
    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(args.fileId);
  },
});
