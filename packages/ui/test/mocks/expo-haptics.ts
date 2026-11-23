// expo-haptics in the component tests: records what was played.
export const played: string[] = [];

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
}
export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export async function impactAsync(style: ImpactFeedbackStyle): Promise<void> {
  played.push(`impact:${style}`);
}
export async function notificationAsync(type: NotificationFeedbackType): Promise<void> {
  played.push(`notification:${type}`);
}
export async function selectionAsync(): Promise<void> {
  played.push('selection');
}
