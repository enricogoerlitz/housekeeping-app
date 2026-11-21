import {
  addStep,
  moveStep,
  RECIPE_LIMITS,
  removeStep,
  stepsForVariants,
  updateStepText,
  type Id,
  type Recipe,
  type StepsDraft,
} from '@housekeeping/core';
import {
  Button,
  EditableSection,
  Icon,
  Menu,
  Notice,
  ReorderList,
  Row,
  Stack,
  Text,
  TextField,
  useTheme,
  type ReorderListLabels,
} from '@housekeeping/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { SectionError, useSectionFrame } from './common';
import { TextSheet } from './text-sheet';
import type { SectionEditor } from './use-section-editor';

type StepAction = 'text' | 'up' | 'down' | 'remove';

const STEP_LABELS: ReorderListLabels = {
  handle: (name) => `Schritt „${name}“ verschieben`,
  up: (name) => `Schritt „${name}“ nach oben`,
  down: (name) => `Schritt „${name}“ nach unten`,
  position: (name, index, total) => `${name}, Schritt ${index + 1} von ${total}`,
};

const stepLength = (text: string) => Array.from(text.trim()).length;

/** Zubereitung (REQ-007): Vorlauf and the steps of the chosen variant; edited as a whole (AC-027). */
export function StepsSection(props: {
  recipe: Recipe;
  variantId: Id | undefined;
  editor: SectionEditor;
}) {
  const { recipe, editor } = props;
  const frame = useSectionFrame(editor, 'steps', 'Zubereitung');
  const draft = editor.draft?.section === 'steps' ? editor.draft : undefined;
  const steps = stepsForVariants(recipe, props.variantId ? [props.variantId] : undefined);
  return (
    <EditableSection {...frame} testID="recipe-steps">
      {draft ? (
        <StepsFields recipe={recipe} draft={draft} editor={editor} />
      ) : (
        <Stack gap={16}>
          {recipe.leadTime ? (
            <Notice
              icon="alarm-clock"
              text={`Vorlauf: ${recipe.leadTime.text}`}
              testID="recipe-lead-time"
            />
          ) : null}
          {steps.length === 0 ? (
            <Text color="muted">Noch keine Schritte.</Text>
          ) : (
            steps.map((step, index) => (
              <Row key={step.id} gap={12} align="flex-start">
                <StepNumber value={index + 1} />
                <Stack gap={4} style={{ flex: 1 }}>
                  <Text testID={`recipe-step-${step.id}`}>{step.text}</Text>
                  {step.timerMinutes ? (
                    <Row gap={5}>
                      <Icon name="timer" size={15} color="muted" />
                      <Text variant="caption" color="muted">
                        {step.timerMinutes} Min
                      </Text>
                    </Row>
                  ) : null}
                </Stack>
              </Row>
            ))
          )}
        </Stack>
      )}
    </EditableSection>
  );
}

function StepsFields(props: { recipe: Recipe; draft: StepsDraft; editor: SectionEditor }) {
  const { recipe, draft, editor } = props;
  // The step whose text is edited in the window; a new step starts blank and goes if left blank.
  const [editing, setEditing] = useState<{ id: Id; added: boolean } | undefined>();
  const set = (changed: StepsDraft) => editor.change(changed);
  const variantName = (id: Id | undefined) =>
    id === undefined ? undefined : recipe.variants.find((variant) => variant.id === id)?.name;
  const add = () => {
    const id = crypto.randomUUID();
    set(addStep(draft, '', id));
    setEditing({ id, added: true });
  };
  const stepProblems = draft.steps.flatMap((step, index) => {
    const message = editor.problem('step', step.id);
    return message ? [`Schritt ${index + 1}: ${message}`] : [];
  });
  const listProblem = editor.problem('steps');
  const editingStep = draft.steps.find((step) => step.id === editing?.id);

  return (
    <Stack gap={16}>
      <Row gap={12} align="flex-start">
        <TextField
          label="Vorlauf"
          placeholder="z. B. Kichererbsen einweichen"
          value={draft.leadTimeText}
          onChangeText={(leadTimeText) => set({ ...draft, leadTimeText })}
          error={editor.problem('leadTimeText')}
          style={{ flex: 2 }}
          testID="recipe-steps-lead-text"
        />
        <TextField
          label="Stunden vorher"
          placeholder="12"
          value={draft.leadTimeHours}
          onChangeText={(leadTimeHours) => set({ ...draft, leadTimeHours })}
          error={editor.problem('leadTimeHours')}
          keyboardType="number-pad"
          style={{ flex: 1 }}
          testID="recipe-steps-lead-hours"
        />
      </Row>

      {draft.steps.length > 0 ? (
        <ReorderList
          items={draft.steps.map((step) => ({
            key: step.id,
            name: step.text.trim() || '(leer)',
            subtitle: variantName(step.variantId),
            muted: !step.text.trim(),
          }))}
          onMove={(key, toIndex) => set(moveStep(draft, key, toIndex))}
          labels={STEP_LABELS}
          trailing={(item, index) => (
            <Menu<StepAction>
              trigger="icon"
              icon="ellipsis"
              label="Mehr"
              accessibilityLabel={`Mehr zu Schritt ${index + 1}`}
              onChange={(action) => {
                if (action === 'text') setEditing({ id: item.key, added: false });
                else if (action === 'remove') set(removeStep(draft, item.key));
                else set(moveStep(draft, item.key, index + (action === 'up' ? -1 : 1)));
              }}
              options={[
                { value: 'text', label: 'Text ändern' },
                { value: 'up', label: 'Nach oben', disabled: index === 0 },
                { value: 'down', label: 'Nach unten', disabled: index === draft.steps.length - 1 },
                { value: 'remove', label: 'Entfernen' },
              ]}
              testID={`recipe-step-menu-${item.key}`}
            />
          )}
          testID="recipe-steps-order"
        />
      ) : null}
      {[...stepProblems, ...(listProblem ? [listProblem] : [])].map((message) => (
        <Text key={message} variant="small" color="warn">
          {message}
        </Text>
      ))}

      <Row>
        <Button
          label="Schritt"
          icon="plus"
          variant="link"
          onPress={add}
          testID="recipe-steps-add"
        />
      </Row>
      <SectionError editor={editor} testID="recipe-steps-error" />

      {editingStep ? (
        <TextSheet
          label="Schritt"
          initial={editingStep.text}
          multiline
          check={(text) =>
            stepLength(text) > RECIPE_LIMITS.stepText
              ? `Höchstens ${RECIPE_LIMITS.stepText} Zeichen`
              : undefined
          }
          title={editing?.added ? 'Neuer Schritt' : 'Schritt ändern'}
          onApply={(text) => {
            set(
              text.trim() || !editing?.added
                ? updateStepText(draft, editingStep.id, text)
                : removeStep(draft, editingStep.id),
            );
            setEditing(undefined);
          }}
          onClose={() => {
            if (editing?.added) set(removeStep(draft, editingStep.id));
            setEditing(undefined);
          }}
          testID="recipe-step-sheet"
        />
      ) : null}
    </Stack>
  );
}

function StepNumber(props: { value: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceSunken,
      }}
    >
      <Text variant="smallStrong">{props.value}</Text>
    </View>
  );
}
