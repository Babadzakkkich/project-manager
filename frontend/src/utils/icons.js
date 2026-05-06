import React from 'react';

import {
  Users,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  RefreshCw,
  FolderPlus,
  FolderPen,
  FolderX,
  Link as LinkIcon,
  Link2Off,
  CirclePlus,
  CheckCircle2,
  ClipboardPen,
  ClipboardX,
  Zap,
  UserRoundCheck,
  UserRoundMinus,
  Clock,
  AlertTriangle,
  Mail,
  MailCheck,
  MailX,
  Video,
  Phone,
  Bell,

  Inbox,
  ClipboardList,
  Eye,
  CircleX,
  ArrowDown,
  ArrowRight,
  ArrowUp,

  Folder,
  Mic,
  MicOff,
  VideoOff,
  ScreenShare,
  MessageCircle,
  LogOut,
  Copy,
  Plus,
  X,
  Send,
  SmilePlus,
  UserX,
  VolumeX,
  Radio,
  Circle,
} from 'lucide-react';

import {
  NOTIFICATION_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  CONFERENCE_ROOM_TYPES,
} from './constants';

export const NOTIFICATION_ICON_COMPONENTS = {
  [NOTIFICATION_TYPES.GROUP_CREATED]: Users,
  [NOTIFICATION_TYPES.GROUP_UPDATED]: Pencil,
  [NOTIFICATION_TYPES.GROUP_DELETED]: Trash2,

  [NOTIFICATION_TYPES.USER_ADDED_TO_GROUP]: UserPlus,
  [NOTIFICATION_TYPES.USER_REMOVED_FROM_GROUP]: UserMinus,
  [NOTIFICATION_TYPES.USER_ROLE_CHANGED]: RefreshCw,

  [NOTIFICATION_TYPES.PROJECT_CREATED]: FolderPlus,
  [NOTIFICATION_TYPES.PROJECT_UPDATED]: FolderPen,
  [NOTIFICATION_TYPES.PROJECT_DELETED]: FolderX,

  [NOTIFICATION_TYPES.GROUP_ADDED_TO_PROJECT]: LinkIcon,
  [NOTIFICATION_TYPES.GROUP_REMOVED_FROM_PROJECT]: Link2Off,

  [NOTIFICATION_TYPES.TASK_CREATED]: CirclePlus,
  [NOTIFICATION_TYPES.TASK_UPDATED]: ClipboardPen,
  [NOTIFICATION_TYPES.TASK_DELETED]: ClipboardX,
  [NOTIFICATION_TYPES.TASK_STATUS_CHANGED]: CheckCircle2,
  [NOTIFICATION_TYPES.TASK_PRIORITY_CHANGED]: Zap,

  [NOTIFICATION_TYPES.USER_ASSIGNED_TO_TASK]: UserRoundCheck,
  [NOTIFICATION_TYPES.USER_UNASSIGNED_FROM_TASK]: UserRoundMinus,

  [NOTIFICATION_TYPES.TASK_DEADLINE_APPROACHING]: Clock,
  [NOTIFICATION_TYPES.TASK_OVERDUE]: AlertTriangle,

  [NOTIFICATION_TYPES.GROUP_INVITATION]: Mail,
  [NOTIFICATION_TYPES.GROUP_INVITATION_ACCEPTED]: MailCheck,
  [NOTIFICATION_TYPES.GROUP_INVITATION_DECLINED]: MailX,

  [NOTIFICATION_TYPES.CONFERENCE_STARTED]: Video,
  [NOTIFICATION_TYPES.CONFERENCE_INVITE]: Phone,
};

export const DEFAULT_NOTIFICATION_ICON = Bell;

export const TASK_STATUS_ICON_COMPONENTS = {
  [TASK_STATUSES.BACKLOG]: Inbox,
  [TASK_STATUSES.TODO]: ClipboardList,
  [TASK_STATUSES.IN_PROGRESS]: RefreshCw,
  [TASK_STATUSES.REVIEW]: Eye,
  [TASK_STATUSES.DONE]: CheckCircle2,
  [TASK_STATUSES.CANCELLED]: CircleX,
};

export const DEFAULT_TASK_STATUS_ICON = ClipboardPen;

export const TASK_PRIORITY_ICON_COMPONENTS = {
  [TASK_PRIORITIES.LOW]: ArrowDown,
  [TASK_PRIORITIES.MEDIUM]: ArrowRight,
  [TASK_PRIORITIES.HIGH]: ArrowUp,
  [TASK_PRIORITIES.URGENT]: AlertTriangle,
};

export const DEFAULT_TASK_PRIORITY_ICON = AlertTriangle;

export const TASK_OVERDUE_ICON_COMPONENT = AlertTriangle;

export const CONFERENCE_ROOM_ICON_COMPONENTS = {
  [CONFERENCE_ROOM_TYPES.PROJECT]: Folder,
  [CONFERENCE_ROOM_TYPES.GROUP]: Users,
  [CONFERENCE_ROOM_TYPES.TASK]: CheckCircle2,
  [CONFERENCE_ROOM_TYPES.INSTANT]: Phone,
};

export const DEFAULT_CONFERENCE_ROOM_ICON = Video;

export const CONFERENCE_ICONS = {
  START: Video,
  CALL: Phone,
  EMPTY: Video,
  ACTIVE: Radio,
  ENDED: Circle,

  MIC_ON: Mic,
  MIC_OFF: MicOff,
  CAMERA_ON: Video,
  CAMERA_OFF: VideoOff,
  SCREEN_SHARE: ScreenShare,
  CHAT: MessageCircle,
  PARTICIPANTS: Users,
  LEAVE: LogOut,
  COPY: Copy,
  ADD: Plus,
  CLOSE: X,
  SEND: Send,
  REACTIONS: SmilePlus,
  MUTE: VolumeX,
  KICK: UserX,
};

export const renderIconComponent = (Icon, props = {}) => {
  if (!Icon) return null;

  const {
    size = 16,
    strokeWidth = 2,
    style,
    ...restProps
  } = props;

  return React.createElement(Icon, {
    size,
    strokeWidth,
    'aria-hidden': 'true',
    focusable: 'false',
    style: {
      display: 'inline-block',
      verticalAlign: '-0.15em',
      flexShrink: 0,
      ...style,
    },
    ...restProps,
  });
};