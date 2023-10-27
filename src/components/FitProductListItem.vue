<template>
  <div>
    <ion-item
      v-if="product"
      :routerLink="'/product/' + product.name"
      :detail="false"
      style="display: flex; flex-wrap: nowrap"
    >
    <!-- TODO die values passen nicht zu den Kategorein. ich glaube Portionierung hat € Zeichen? -->
      <ion-label class="table-cell">{{ product.firma }}</ion-label>
      <ion-label class="table-cell">{{ product.produktkategorie }}</ion-label>
      <ion-label class="table-cell">{{ product.name }}</ion-label>
      <ion-label class="table-cell">{{ product.preisPerPackung }} €</ion-label>
      <ion-label class="table-cell">{{ product.preisPerKG }} €</ion-label>
      <ion-label class="table-cell">{{ product.portionenPerPkg }}</ion-label>
      <ion-label class="table-cell">{{ product.gewichtPerPkg }} g </ion-label>
      <ion-label class="table-cell">{{ product.vegan }}</ion-label>
    </ion-item>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonItem, IonLabel, IonNote } from "@ionic/vue";
import { chevronForward } from "ionicons/icons";

defineProps({
  product: Object,
});

const isIos = () => {
  const win = window as any;
  return win && win.Ionic && win.Ionic.mode === "ios";
};
var count: 1;
</script>

<style scoped>
.table-cell {
  border-right: 1px solid #e5e5e5;
  background-color: rgb(48, 48, 24);
  padding: 10px;
  min-width: 200px;
  text-align: center;
}

.table-cell:last-child {
  border-right: none;
}
</style>
