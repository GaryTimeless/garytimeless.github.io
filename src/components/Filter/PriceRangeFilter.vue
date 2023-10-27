<template>
  <ion-list>
    <ion-item>
      <ion-input
        :value="inputModel"
        @ionInput="onInput($event)"
        ref="ionInputEl"
        placeholder="Max Preis € "
      ></ion-input>
    </ion-item>
  </ion-list>
</template>

<script lang="ts">
import { IonInput, IonItem, IonList } from "@ionic/vue";
import { defineComponent, ref } from "vue";

export default defineComponent({
  components: { IonInput, IonItem, IonList },
  methods: {},
  setup(_, context) {
    const ionInputEl = ref();
    const inputModel = ref("");
    const onInput = (ev) => {
      // Wert aus dem Imput Feld wird in const gespeichert
      const selectMaxPrice = ev.target!.value;

      //Nur Zahlen sind im Feld erlaubt. alles andere wird durch "" ersetzt.
      let filteredValue = selectMaxPrice.replace(/[^0-9]+/g, "");

      // Wird an ParentKomponente vermittelt
      context.emit("validMaxPrice", filteredValue || "10000");

      // Das sorgt dafür, dass es so aussehen lässt, dass man keinen anderen Wert als den oben genannten eingeben kann.
      const inputCmp = ionInputEl.value;
      if (inputCmp !== undefined) {
        inputCmp.$el.value = filteredValue;
      }
    };

    return { ionInputEl, inputModel, onInput };
  },
});
</script>
