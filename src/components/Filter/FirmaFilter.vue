<template>
  <ion-list>
    <ion-item>
      <ion-select
        aria-label="Firma"
        placeholder="Wähle Firmen aus"
        @ionChange="handleChange"
        :multiple="true"
      >
        <ion-select-option v-for="firma in firmen" :value="firma.value">{{
          firma.label
        }}</ion-select-option>
      </ion-select>
    </ion-item>
  </ion-list>
</template>

<script lang="ts">
import { IonItem, IonList, IonSelect, IonSelectOption } from "@ionic/vue";
import { Ref, defineComponent, ref } from "vue";
export default defineComponent({
  components: { IonItem, IonList, IonSelect, IonSelectOption },
  props: {
    firmen: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      selectedValues: [] as string[], // Hier wird ein leeres Array für die ausgewählten Werte initialisiert
    };
  },
  methods: {
    handleChange(event: any) {
      // Hier werden die ausgewählten Firmen in der Konsole ausgegeben
      console.log("Ausgewählte Firmen:", event.detail.value);
      this.selectedValues = event.detail.value;
      this.$emit("SelectedFirmaChange", this.selectedValues);
    },
  },
});
</script>