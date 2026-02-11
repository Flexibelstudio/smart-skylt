import { Organization, DisplayPost, DisplayScreen } from '../../types';

/**
 * Creates copies of a post and adds them to target screens, including sync metadata.
 */
export function copyPostToScreens(
  postToCopy: DisplayPost,
  targetScreenIds: string[],
  sourceScreenId: string,
  organization: Organization,
): DisplayScreen[] {
  const updatedScreens = [...(organization.displayScreens || [])];
  // An original post's ID is its own source ID for tracking.
  const sourcePostId = postToCopy.sharedFromPostId || postToCopy.id;

  targetScreenIds.forEach(targetId => {
    const targetScreenIndex = updatedScreens.findIndex(s => s.id === targetId);
    if (targetScreenIndex > -1) {
      const newPost: DisplayPost = {
        ...JSON.parse(JSON.stringify(postToCopy)), // Deep copy
        id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sharedFrom: sourceScreenId,
        sharedFromPostId: sourcePostId,
        sharedAt: new Date().toISOString(),
      };
      
      const targetScreen = updatedScreens[targetScreenIndex];
      targetScreen.posts = [...(targetScreen.posts || []), newPost];
      updatedScreens[targetScreenIndex] = targetScreen;
    }
  });

  return updatedScreens;
}

/**
 * Syncs changes from an original post to all its shared copies across the organization.
 */
export function syncSharedPosts(
  updatedOriginalPost: DisplayPost,
  organization: Organization,
): DisplayScreen[] {
  const originalPostId = updatedOriginalPost.id;
  
  // These are the fields that should be preserved in the shared copy, as they can be unique per channel.
  const fieldsToPreserve: (keyof DisplayPost)[] = [
      'id', 'sharedFrom', 'sharedFromPostId', 'sharedAt', 'internalTitle'
  ];

  return (organization.displayScreens || []).map(screen => {
    const updatedPosts = (screen.posts || []).map(post => {
      // Case 1: This is a shared copy of the post that was just updated. Sync it.
      if (post.sharedFromPostId === originalPostId) {
        const preservedData = fieldsToPreserve.reduce((acc, key) => {
            (acc as any)[key] = post[key];
            return acc;
        }, {} as Partial<DisplayPost>);
        
        const syncedPost: DisplayPost = {
            ...JSON.parse(JSON.stringify(updatedOriginalPost)),
            ...preservedData,
        };
        return syncedPost;
      }
      // Case 2: This is the original post itself. Return the updated version.
      if (post.id === originalPostId) {
          return updatedOriginalPost;
      }
      // Case 3: Not related, return as is.
      return post;
    });

    return { ...screen, posts: updatedPosts };
  });
}

/**
 * Gets visibility info for a post.
 */
export function getPostVisibility(
  post: DisplayPost,
  currentScreenId: string,
  organization: Organization,
): { isShared: boolean; sourceScreenName?: string; visibleIn: { id: string; name: string }[] } {
  
  if (post.sharedFromPostId && post.sharedFrom) {
    const sourceScreenName = organization.displayScreens?.find(s => s.id === post.sharedFrom)?.name;
    return {
      isShared: true,
      sourceScreenName: sourceScreenName || 'Okänd kanal',
      visibleIn: [],
    };
  }

  // It's an original post, find where it's visible.
  const visibleIn: { id: string; name: string }[] = [];
  const currentScreen = organization.displayScreens?.find(s => s.id === currentScreenId);
  if (currentScreen) {
      visibleIn.push({ id: currentScreen.id, name: currentScreen.name });
  }

  (organization.displayScreens || []).forEach(screen => {
    if (screen.id === currentScreenId) return; // Already added
    if ((screen.posts || []).some(p => p.sharedFromPostId === post.id)) {
      visibleIn.push({ id: screen.id, name: screen.name });
    }
  });

  return {
    isShared: false,
    visibleIn,
  };
}