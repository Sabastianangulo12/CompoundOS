import { supabase } from "./supabase";

export type CommunityPostVisibility = "friends_only" | "gym_feed";
export type PostReaction = "🔥" | "💪" | "👏";

export type CommunityMemberPreview = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type FriendRequestRecord = {
  id: string;
  gym_id: string;
  sender_member_id: string;
  receiver_member_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
  sender_member?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  receiver_member?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

export type CommunityPostRecord = {
  id: string;
  gym_id: string;
  member_id: string;
  body: string | null;
  image_url: string | null;
  visibility: CommunityPostVisibility;
  is_auto_generated: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  members: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  post_likes: Array<{
    id: string;
    member_id: string;
    reaction: PostReaction;
  }>;
  post_comments: Array<{
    id: string;
    body: string;
    created_at: string;
    member_id: string;
    members: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  }>;
};

export async function searchGymMembers(searchQuery: string) {
  const result = await supabase.rpc("search_gym_members", {
    search_query: searchQuery.trim()
  });

  return {
    data: (result.data ?? []) as CommunityMemberPreview[],
    error: result.error
  };
}

export async function fetchFriendRequests(memberId: string) {
  const result = await supabase
    .from("friend_requests")
    .select(
      `
        *,
        sender_member:members!friend_requests_sender_member_id_fkey (
          id,
          first_name,
          last_name
        ),
        receiver_member:members!friend_requests_receiver_member_id_fkey (
          id,
          first_name,
          last_name
        )
      `
    )
    .or(`sender_member_id.eq.${memberId},receiver_member_id.eq.${memberId}`)
    .order("created_at", {
      ascending: false
    });

  return {
    data: (result.data ?? []) as FriendRequestRecord[],
    error: result.error
  };
}

export async function fetchCommunityFeed() {
  const result = await supabase
    .from("community_posts")
    .select(
      `
        *,
        members (
          id,
          first_name,
          last_name
        ),
        post_likes (
          id,
          member_id,
          reaction
        ),
        post_comments (
          id,
          body,
          created_at,
          member_id,
          members (
            id,
            first_name,
            last_name
          )
        )
      `
    )
    .order("created_at", {
      ascending: false
    })
    .limit(20);

  return {
    data: rankCommunityPosts((result.data ?? []) as CommunityPostRecord[]),
    error: result.error
  };
}

export async function createCommunityPost(
  body: string,
  imageUrl: string,
  visibility: CommunityPostVisibility
) {
  return supabase.rpc("create_community_post", {
    post_body: body.trim() || null,
    post_image_url: imageUrl.trim() || null,
    post_visibility: visibility
  });
}

export async function sendFriendRequest(memberId: string) {
  return supabase.rpc("create_friend_request", {
    target_member_id: memberId
  });
}

export async function acceptFriendRequest(requestId: string) {
  return supabase.rpc("accept_friend_request", {
    request_id: requestId
  });
}

export async function reactToPost(postId: string, reaction: PostReaction) {
  return supabase.rpc("react_to_post", {
    target_post_id: postId,
    reaction_value: reaction
  });
}

export async function createPostComment(postId: string, body: string) {
  return supabase.rpc("create_post_comment", {
    target_post_id: postId,
    comment_body: body.trim()
  });
}

export async function blockMember(memberId: string) {
  return supabase.rpc("block_member", {
    target_member_id: memberId
  });
}

export async function reportMember(memberId: string, reason: string) {
  return supabase.rpc("report_member", {
    target_member_id: memberId,
    report_reason: reason.trim() || "Reported from community feed"
  });
}

export function getReactionCounts(
  likes: CommunityPostRecord["post_likes"]
): Record<PostReaction, number> {
  return likes.reduce(
    (counts, like) => ({
      ...counts,
      [like.reaction]: counts[like.reaction] + 1
    }),
    {
      "🔥": 0,
      "💪": 0,
      "👏": 0
    } satisfies Record<PostReaction, number>
  );
}

function rankCommunityPosts(posts: CommunityPostRecord[]) {
  return [...posts].sort((left, right) => {
    const rightScore = getPostRankingScore(right);
    const leftScore = getPostRankingScore(left);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  });
}

function getPostRankingScore(post: CommunityPostRecord) {
  const ageHours = Math.max(
    1,
    (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60)
  );
  const reactions = post.post_likes.length;
  const comments = post.post_comments.length;
  const freshnessBoost = Math.max(0, 48 - ageHours);
  const autoGeneratedPenalty = post.is_auto_generated ? 2 : 0;

  return freshnessBoost + reactions * 3 + comments * 4 - autoGeneratedPenalty;
}
