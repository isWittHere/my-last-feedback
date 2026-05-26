/**
 * ZEVEN Component Library
 * ========================
 * Design system for CBZW (财报中文网)
 *
 * Features:
 * - Zero border-radius, Zero shadow
 * - Black-and-white with hatching line art
 * - 7×7 dot matrix animation system
 * - CVA-based variant management
 */

// ─── Foundation ───
export { colors, fonts, breakpoints, containerWidth, spacing } from './foundation/tokens'
export { fadeUp, fadeUpInView, staggerContainer, staggerItem, scaleOnHover, delayedFade } from './foundation/motion'

// ─── Typography ───
export { Heading, headingVariants, type HeadingProps } from './typography/Heading'
export { Text, textVariants, type TextProps } from './typography/Text'
export { Label, type LabelProps } from './typography/Label'

// ─── Layout ───
export { Container, containerVariants, type ContainerProps } from './layout/Container'
export { Section, sectionVariants, type SectionProps } from './layout/Section'
export { Divider, type DividerProps } from './layout/Divider'
export { Grid, gridVariants, type GridProps } from './layout/Grid'

// ─── UI ───
export { Button, buttonVariants, type ButtonProps } from './ui/Button'
export { Input, inputVariants, type InputProps } from './ui/Input'
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants, type CardProps } from './ui/Card'
export { Tabs, type TabsProps } from './ui/Tabs'
export { Badge, badgeVariants, type BadgeProps } from './ui/Badge'
export { FormField, type FormFieldProps } from './ui/FormField'

// ─── DotMatrix ───
export { DotMatrix, type DotMatrixSize } from './dotmatrix/DotMatrix'
export { DotMatrixBar, type BarItem, type DotMatrixBarConfig, type DotMatrixBarProps } from './dotmatrix/DotMatrixBar'
export { DotMatrixBarVertical, type DotMatrixBarVerticalProps } from './dotmatrix/DotMatrixBarVertical'
export { DotMatrixBarStacked, type StackedBarItem, type StackedSegment, type DotMatrixBarStackedProps } from './dotmatrix/DotMatrixBarStacked'
export { LOGO, HIDDEN_INDICES, allPresets, loadingPresets, loopPresets, appPresets, thinkingAnims, outputAnims, toolCallAnims, type AnimationPreset } from './dotmatrix/presets'

// ─── Hatching ───
export { HatchPattern, hatchPatternVariants, type HatchPatternProps } from './hatching/HatchPattern'
export { HatchHero } from './hatching/HatchHero'
export { HatchDivider, type HatchDividerProps } from './hatching/HatchDivider'

// ─── Composition ───
export { FadeIn, type FadeInProps } from './composition/FadeIn'
export { FeatureRow, type FeatureRowProps } from './composition/FeatureRow'
export { StatGrid, type StatItem, type StatGridProps } from './composition/StatGrid'
export { ChatMessage, type ChatMessageData, type ChatMessageProps, type ContentBlock, type BlockOrigin } from './composition/ChatMessage'
export { MarkdownBlock } from './composition/chat/MarkdownBlock'
export { ThinkingBlock } from './composition/chat/ThinkingBlock'
export { ToolCallBlock } from './composition/chat/ToolCallBlock'
export { ChartBlock } from './composition/chat/ChartBlock'
export { CardBlock } from './composition/chat/CardBlock'
export { ExportPanel } from './composition/chat/ExportPanel'
export { CitationBlock, type CitationSource } from './composition/chat/CitationBlock'
export { TaskListBlock, type TaskItem } from './composition/chat/TaskListBlock'
export { ProcessGroup } from './composition/chat/ProcessGroup'
export { ArtifactStrip } from './composition/chat/ArtifactStrip'
export { DotIcon, type DotIconName } from './composition/chat/DotIcon'
export { FAQSection, type FAQItem, type FAQSectionProps } from './composition/FAQSection'
export { StepFlow, type StepFlowItem, type StepFlowProps } from './composition/StepFlow'

// ─── Utilities ───
export { cn } from '@/lib/cn'
