import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Comment } from "../models/comment.model.js";
import mongoose, { isValidObjectId } from "mongoose";

const commentCommonAggregation = (req) => {
  return [
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              avatar: 1,
              username: 1,
              fullName: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "comment",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "comment",
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
      $addFields: {
        owner: {
          $first: "$owner",
        },
        likes: {
          $size: "$likes",
        },
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
  ];
};

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const commentAggregation = Comment.aggregate([
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId),
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    ...commentCommonAggregation(req),
  ]);

  const comments = await Comment.aggregatePaginate(commentAggregation, {
    page,
    limit,
    customLabels: {
      totalDocs: "totalComments",
      docs: "comments",
      pagingCounter: "serialNumberStartFrom",
    },
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, comments, "Video Comments fetched successfully!")
    );
});

const addComment = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { content } = req.body;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id!");
  }

  if (!content?.trim()) {
    throw new ApiError(400, "Content is required!");
  }

  const comment = await Comment.create({
    content,
    video: new mongoose.Types.ObjectId(videoId),
    owner: req.user?._id,
  });

  if (!comment) {
    throw new ApiError(400, "Something went wrong while posting comment!");
  }

  const createdComment = await Comment.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(comment._id),
      },
    },
    ...commentCommonAggregation(req),
  ]);

  return res
    .status(201)
    .json(
      new ApiResponse(200, createdComment[0], "Comment added successfully!")
    );
});

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment id!");
  }

  if (!content?.trim()) {
    throw new ApiError(400, "Content is required!");
  }

  const comment = await Comment.findOne({
    _id: new mongoose.Types.ObjectId(commentId),
    owner: req.user?._id,
  });

  if (!comment) {
    throw new ApiError(404, "Comment not found!");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    comment._id,
    {
      $set: {
        content,
      },
    },
    {
      new: true,
    }
  );

  const aggregatedComment = await Comment.aggregate([
    {
      $match: {
        _id: updatedComment._id,
      },
    },
    ...commentCommonAggregation(req),
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        aggregatedComment[0],
        "Comment updated successfully!"
      )
    );
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Comment id invalid!");
  }

  const comment = await Comment.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(commentId),
    owner: req.user?._id,
  });

  if (!comment) {
    throw new ApiError(400, "Something went wrong while deleting the comment!");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment deleted successfully!"));
});

export { getVideoComments, addComment, updateComment, deleteComment };
