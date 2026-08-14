import {
  Pencil,
  Menu,
  Trash2,
  Check,
  CheckCheck,
  X,
  Plus,
  Lock,
  Archive,
  PencilOff,
  MessageSquareReply,
  Bell,
  BellOff,
  LogOut,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  AtSign,
  Pin,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Headphones,
  HeadphoneOff,
  PhoneOff,
  Upload,
  LoaderCircle,
  Smile,
  Reply,
  History,
  Shield,
  UserCog,
  Users,
  MessageSquare,
  ArrowDown,
  LogIn,
  Paperclip,
  Send,
  Search,
  Link,
  Download,
  FileText,
  UserPlus,
  Wrench,
  Star,
  ChevronRight,
  ChevronDown,
  EllipsisVertical,
  Sticker,
  MapPin,
  Cake,
  GripVertical,
  ArrowUpDown,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  Maximize2,
  Megaphone,
  Settings2,
  Flag,
  Sun,
  Moon,
  Eye,
  CloudOff,
  AlertTriangle,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

export interface IconProps {
  size?: number;
  className?: string;
  title?: string;
}

type LucideCmp = React.ComponentType<LucideProps>;

const make =
  (Cmp: LucideCmp, defaultSize: number, extra?: Partial<LucideProps>) =>
  ({ size = defaultSize, className, title }: IconProps) => (
    <Cmp
      size={size}
      className={className}
      {...(title ? { title, role: "img", "aria-label": title, "aria-hidden": false } : {})}
      {...extra}
    />
  );

export const EditIcon = make(Pencil, 14);
export const MaximizeIcon = make(Maximize2, 14);
export const MegaphoneIcon = make(Megaphone, 14);
export const SettingsSlidersIcon = make(Settings2, 16);
export const MenuIcon = make(Menu, 14);
export const TrashIcon = make(Trash2, 14);
export const CheckIcon = make(Check, 14);
export const CheckDoubleIcon = make(CheckCheck, 14);
export const XIcon = make(X, 14);
export const PlusIcon = make(Plus, 16);
export const LockIcon = make(Lock, 11);
export const ArchiveIcon = make(Archive, 11);
export const ReadonlyIcon = make(PencilOff, 11);
export const ReadonlyRepliesIcon = make(MessageSquareReply, 11);
export const BellIcon = make(Bell, 14);
export const BellOffIcon = make(BellOff, 14);
export const LogOutIcon = make(LogOut, 14);
export const PinIcon = make(Pin, 14);
export const MicrophoneIcon = make(Mic, 14);
export const MicOffIcon = make(MicOff, 18);
export const VolumeIcon = make(Volume2, 14);
export const VolumeMutedIcon = make(VolumeX, 14);
export const HeadphonesIcon = make(Headphones, 18);
export const HeadphonesOffIcon = make(HeadphoneOff, 18);
export const PhoneOffIcon = make(PhoneOff, 22);
export const UploadIcon = make(Upload, 18);
export const SmileIcon = make(Smile, 15);
export const ReplyIcon = make(Reply, 15);
export const HistoryIcon = make(History, 15);
export const ShieldIcon = make(Shield, 14);
export const FlagIcon = make(Flag, 14);
export const ManageUsersIcon = make(UserCog, 13);
export const UsersIcon = make(Users, 13);
export const ChatBubbleIcon = make(MessageSquare, 40, { strokeWidth: 1.5 });
export const ArrowDownIcon = make(ArrowDown, 12);
export const LogInIcon = make(LogIn, 18);
export const PaperclipIcon = make(Paperclip, 14);
export const SendIcon = make(Send, 16);
export const BoldIcon = make(Bold, 16);
export const ItalicIcon = make(Italic, 16);
export const UnderlineIcon = make(Underline, 16);
export const StrikethroughIcon = make(Strikethrough, 16);
export const CodeIcon = make(Code, 16);
export const Heading1Icon = make(Heading1, 16);
export const Heading2Icon = make(Heading2, 16);
export const ListIcon = make(List, 16);
export const ListOrderedIcon = make(ListOrdered, 16);
export const QuoteIcon = make(Quote, 16);
export const AtSignIcon = make(AtSign, 16);
export const SearchIcon = make(Search, 14);
export const LinkIcon = make(Link, 14);
export const DownloadIcon = make(Download, 14);
export const UsersGroupIcon = make(UserPlus, 14);
export const WrenchIcon = make(Wrench, 18);
export const StarIcon = make(Star, 14);
export const StarFilledIcon = make(Star, 14, { fill: "currentColor" });
export const ChevronRightIcon = make(ChevronRight, 14);
export const ChevronDownIcon = make(ChevronDown, 14);
export const EllipsisIcon = make(EllipsisVertical, 14);
export const MoreVerticalIcon = make(EllipsisVertical, 14);
export const SunIcon = make(Sun, 14);
export const MoonIcon = make(Moon, 14);
export const EyeIcon = make(Eye, 13);
export const StickerIcon = make(Sticker, 15);
export const MapPinIcon = make(MapPin, 14);
export const CakeIcon = make(Cake, 14);
export const GripVerticalIcon = make(GripVertical, 16);
export const ArrowUpDownIcon = make(ArrowUpDown, 14);
export const VideoIcon = make(Video, 18);
export const VideoOffIcon = make(VideoOff, 18);
export const ScreenShareIcon = make(ScreenShare, 18);
export const ScreenShareOffIcon = make(ScreenShareOff, 18);
export const CloudOffIcon = make(CloudOff, 11);
export const AlertTriangleIcon = make(AlertTriangle, 11);

export const Spinner = ({ size = 20, className }: IconProps) => (
  <LoaderCircle size={size} className={`animate-spin${className ? ` ${className}` : ""}`} />
);

export const FileTypeIcon = ({
  size = 20,
  className,
  title,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mimeType: _mimeType,
}: IconProps & { mimeType?: string | null }) => (
  <FileText size={size} className={className} {...(title ? { title } : {})} />
);
