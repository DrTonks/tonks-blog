export function getTypeIcon(type: string): string {
  switch (type) {
    case 'album': return 'material-symbols:photo-library';
    case 'education': return 'material-symbols:school';
    case 'love': return 'material-symbols:favorite';
    case 'work': return 'material-symbols:work';
    case 'project': return 'material-symbols:code';
    case 'achievement': return 'material-symbols:emoji-events';
    default: return 'material-symbols:event';
  }
}
