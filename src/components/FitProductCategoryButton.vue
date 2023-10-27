<template>
  <div>
    <ion-item style="display: flex; flex-wrap: nowrap">
      <!-- Firma-->
      <ion-button
        @click="handleButtonClick('Firma')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Firma
      </ion-button>

      <!-- Produkt Kategorie-->
      <ion-button
        @click="handleButtonClick('Kategorie')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Kategorie</ion-button
      >

      <!-- Produkt Name-->
      <ion-button
        @click="handleButtonClick('Produktname')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Produktname</ion-button
      >
       <!-- Preis Per Pkg-->
      <ion-button
        @click="handleButtonClick('Preis/Pkg')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Preis/Pakg</ion-button
      >
       <!-- Portionierung -->
      <ion-button
        @click="handleButtonClick('PreisProKG')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Preis/1000g</ion-button
      >
      <!-- PortionenPerPkg -->
      <ion-button
        @click="handleButtonClick('PortionenPerPkg')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Portionen/PAKG</ion-button
      >

      <!-- GewichtPerPkg -->
      <ion-button
        @click="handleButtonClick('GewichtPerPkg')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Gewicht/PAKG</ion-button
      >

      <!-- Vegan -->
      <ion-button
        @click="handleButtonClick('Vegan')"
        fill="clear"
        style="color: antiquewhite"
        class="table-button"
      >
        <ion-icon :icon="swapVerticalOutline" style="margin-right: 8px">
        </ion-icon>
        Vegan</ion-button
      >
    </ion-item>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonItem} from "@ionic/vue";
import { swapVerticalOutline } from "ionicons/icons";

defineProps({
  product: Object,
});

const emit = defineEmits();
const handleButtonClick = (sortKey: string) => {
  // Ihr Code, der ausgeführt werden soll, wenn der Button geklickt wird
  emit("sort", sortKey);
};

const isIos = () => {
  const win = window as any;
  return win && win.Ionic && win.Ionic.mode === "ios";
};
var count: 1;
</script>

<style scoped>
.table-button {
  border-right: 1px solid #e5e5e5;
  background-color: rgb(115, 115, 26);
  padding: 10px;
  min-width: 200px;
  text-align: center;
}

.table-button:last-child {
  border-right: none;
}
</style>
