import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFileFromCloudinary,
  deleteVideoFromCloudinary,
  uploadOnCloudinary,
  uploadVideoOnCloudinary,
} from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  const videoAggregation = Video.aggregate([
    {
      $match: userId
        ? {
            owner: new mongoose.Types.ObjectId(userId),
          }
        : {},
    },
    {
      $match:
        query?.length > 0
          ? {
              $or: [
                {
                  title: {
                    $regex: query,
                    $options: "i",
                  },
                },
                {
                  description: {
                    $regex: query,
                    $options: "i",
                  },
                },
              ],
            }
          : {},
    },
    {
      $match: {
        isPublished: true,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: {
          $first: "$owner",
        },
      },
    },
    {
      $sort: {
        [sortBy]: sortType === "desc" ? -1 : 1,
      },
    },
    {
      $skip: (parseInt(page) - 1) * parseInt(limit),
    },
    {
      $limit: parseInt(limit),
    },
  ]);

  const videos = await Video.aggregatePaginate(videoAggregation, {
    page,
    limit,
    customLabels: {
      totalDocs: "totalVideos",
      docs: "videos",
      pagingCounter: "serialNumberStartFrom",
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully!"));
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if ([title, description].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required!");
  }

  const videoLocalPath = req.files?.videoFile[0]?.path;
  if (!videoLocalPath) {
    throw new ApiError(400, "Video is required!");
  }

  const thumbnailLocalPath = req.files?.thumbnail[0]?.path;
  console.log(thumbnailLocalPath);
  if (!thumbnailLocalPath) {
    throw new ApiError(400, "Thumbnail is required!");
  }

  const videoFile = await uploadVideoOnCloudinary(videoLocalPath);
  if (!videoFile) {
    throw new ApiError(400, "Video is required!");
  }

  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);
  if (!thumbnail) {
    throw new ApiError(400, "Thumbnail is required!");
  }

  const video = await Video.create({
    videoFile: {
      publicId: videoFile?.public_id,
      url: videoFile?.secure_url,
    },
    thumbnail: {
      publicId: thumbnail?.public_id,
      url: thumbnail?.secure_url,
    },
    title,
    description,
    duration: videoFile?.duration,
    owner: req.user?._id,
  });

  const createdVideo = await Video.aggregate([
    {
      $match: {
        _id: video._id,
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "video",
        as: "comments",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "isLiked",
        pipeline: [
          {
            $match: {
              likedBy: new mongoose.Types.ObjectId(req.user?._id),
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: { $first: "$owner" },
        likes: { $size: "$likes" },
        comments: { $size: "$comments" },
        isLiked: {
          $cond: {
            if: {
              $gte: [
                {
                  $size: "$isLiked",
                },
                1,
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
  ]);

  if (!createdVideo) {
    throw new ApiError(400, "Something went wrong while publishing the video!");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(200, createdVideo[0], "Video published successfully!")
    );
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new ApiError(404, `Video with video ID ${videoId} does not exists!`);
  }

  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "video",
        as: "comments",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "isLiked",
        pipeline: [
          {
            $match: {
              likedBy: new mongoose.Types.ObjectId(req.user?._id),
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: { $first: "$owner" },
        likes: { $size: "$likes" },
        comments: { $size: "$comments" },
        isLiked: {
          $cond: {
            if: {
              $gte: [
                {
                  $size: "$isLiked",
                },
                1,
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
  ]);

  // console.log(video);

  if (!video[0]) {
    throw new ApiError(404, "Video does not exists!");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video[0], "Video fetched successfully!"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;

  const video = await Video.findOne({
    _id: new mongoose.Types.ObjectId(videoId),
    owner: req.user?._id,
  });

  if (!video) {
    throw new ApiError(404, "Video does not exists!");
  }

  let newThumbnailLocalPath = req.file?.path;
  let thumbnail;

  if (newThumbnailLocalPath) {
    thumbnail = await uploadOnCloudinary(newThumbnailLocalPath);

    if (!thumbnail.secure_url) {
      throw new ApiError(
        400,
        "Error while uploading the thumbnail on cloudinary!"
      );
    }

    await deleteFileFromCloudinary(video.thumbnail.publicId);
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        title,
        description,
        thumbnail: {
          publicId: thumbnail?.public_id || video.thumbnail.publicId,
          url: thumbnail?.secure_url || video.thumbnail.url,
        },
      },
    },
    {
      new: true,
    }
  );

  const aggregatedVideo = await Video.aggregate([
    {
      $match: {
        _id: updatedVideo._id,
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "video",
        as: "comments",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "isLiked",
        pipeline: [
          {
            $match: {
              likedBy: new mongoose.Types.ObjectId(req.user?._id),
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: { $first: "$owner" },
        likes: { $size: "$likes" },
        comments: { $size: "$comments" },
        isLiked: {
          $cond: {
            if: {
              $gte: [
                {
                  $size: "$isLiked",
                },
                1,
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, aggregatedVideo[0], "Video updated successfully!")
    );
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const video = await Video.findOne({
    _id: videoId,
    owner: req.user?._id,
  });

  if (!video) {
    throw new ApiError(404, "Video does not exist!");
  }

  await deleteFileFromCloudinary(video.thumbnail.publicId);
  await deleteVideoFromCloudinary(video.videoFile.publicId);

  await Video.deleteOne({
    _id: video._id,
    owner: req.user?._id,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video deleted successfully!"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const video = await Video.findOne({
    _id: new mongoose.Types.ObjectId(videoId),
    owner: req.user?._id,
  });

  if (!video) {
    throw new ApiError(404, "Video does not exist!");
  }

  await Video.findByIdAndUpdate(
    video._id,
    {
      $set: {
        isPublished: !video.isPublished,
      },
    },
    {
      new: true,
    }
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        video.isPublished === true
          ? "Video unpublished successfully"
          : "Video published successfully!"
      )
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
