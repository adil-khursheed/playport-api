import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadOnCloudinary,
  uploadVideoOnCloudinary,
} from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
  // TODO: get all videos based on query,sort,pagination
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
    owner: req.user._id,
  });

  const createdVideo = await Video.findById(video._id);

  if (!createdVideo) {
    throw new ApiError(400, "Something went wrong while publishing the video!");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdVideo, "Video published successfully!"));
});

export { getAllVideos, publishAVideo };
