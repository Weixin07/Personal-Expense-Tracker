import { codegenNativeComponent, type ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  /** While true, no view inside can take keyboard or D-pad focus. */
  blocked: boolean;
}

export default codegenNativeComponent<NativeProps>('FocusBlockView');
