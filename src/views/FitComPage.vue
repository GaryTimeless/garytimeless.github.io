<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Comparison of fitness products by G.Schenk</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Inbox</ion-title>
        </ion-toolbar>
      </ion-header>

      <div class="Container">
        <!-- List of all Filter-->
        <!-- TODO alle filter als einzelne Componenten schreiben.-->
        <div class="filter-wrapper">
          <ion-list>
            <!-- Firma Filter - 
              :firmen wird eine Lise von Firmen mitgegeben
              @update -->
            <FirmaFilter
              :firmen="firmenListe"
              @SelectedFirmaChange="handleSelectedFirmen"
            />

            <ProduktkategorieFilter
              :productKategorie="productKategorieListe"
              @SelectedProduktKategorieChange="handleSelectedProduktKategorie"
            />

            <PriceRangeFilter @validMaxPrice="handleValidMaxPrice" />

            <!-- VEGAN-->
            <veganFilter @update:modelValue="handleVeganChange" />

            <PakgSizeFilter @selectedPakgSize="handleSelectedPakgSize" />
          </ion-list>
        </div>

        <!-- List of all Products-->
        <div class="list-wrapper">
          <ion-list>
            <FitProductCategoryButton
              @sort="sortProducts"
            ></FitProductCategoryButton>
            <FitProductListItem
              v-for="product in filteredProducts"
              :key="product.id"
              :product="product"
            />
          </ion-list>
        </div>
      </div>
      <!-- improvised footer-->
      <div
        style="
          height: 100px;
          background-color: rgb(66, 58, 50);
          margin-top: 10%;
        "
      ></div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import PakgSizeFilter from "@/components/Filter/PakgSizeFilter.vue";
const SelectedPakgSizeFromChild = ref<{ lower: number; upper: number }>({
  lower: 0,
  upper: 0,
});
const handleSelectedPakgSize = (PakgSize: any) => {
  SelectedPakgSizeFromChild.value.lower = PakgSize.value.lower;
  SelectedPakgSizeFromChild.value.upper = PakgSize.value.upper;
};

import {
  IonContent,
  IonHeader,
  IonList,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import FitProductListItem from "@/components/FitProductListItem.vue";
import FitProductCategoryButton from "@/components/FitProductCategoryButton.vue";
import { getProducts, FitProduct } from "@/data/FitProducts";

import { watch, ref, onMounted, computed } from "vue";

declare var gapi: any;

const products = ref<FitProduct[]>([]);

// Zustand für die Initialisierung von gapi
const gapiInitialized = ref(false);

// Initialisiere gapi, wenn die Seite geladen wird
onMounted(() => {
  if (typeof gapi !== "undefined") {
    gapi.load("client", () => {
      gapi.client
        .init({
          apiKey: "AIzaSyB8SicDdK4Y13FgWJ9FP_SPg3ApT5rXCD0",
          discoveryDocs: [
            "https://sheets.googleapis.com/$discovery/rest?version=v4",
          ],
        })
        .then(() => {
          gapiInitialized.value = true;
        });
    });
  }
});

function fetchProductsFromSheet() {
  if (!gapiInitialized.value) return;

  gapi.client.sheets.spreadsheets.values
    .get({
      spreadsheetId: "1P2hq9-DQkitIYaZFzSh6av_2uP-ifk529yZbNfGZV4U",
      range: "Base",
    })
    .then((response: any) => {
      const rawData = response.result.values;
      products.value = rawData.slice(1).map((row: any) => ({
        firma: row[0],
        produktkategorie: row[1],
        name: row[2],
        vegan: row[3],
        preisPerPackung: row[4],
        preisPerKG: row[5],
        portionierung: row[6],
        portionenPerPkg: row[7],
        gewichtPerPkg: row[10],
      }));
    });
}

// Rufe die Funktion auf, sobald gapi initialisiert ist
watch(gapiInitialized, (newValue) => {
  if (newValue) fetchProductsFromSheet();
});

// const products = ref<FitProduct[]>(getProducts());

const refresh = (ev: CustomEvent) => {
  setTimeout(() => {
    ev.detail.complete();
  }, 3000);
};

const Test = (selectedFirma: string[]) => {
  // Hier erhältst du die ausgewählten Firmen von der Kindkomponente
  console.log(
    "Ausgewählte Firmen in übergeordneter Komponente:",
    selectedFirma
  );

  // Verarbeite die ausgewählten Firmen hier
};

const sortProducts = (key: string) => {
  if (key === "Firma") {
    products.value.sort((a, b) => a.firma.localeCompare(b.firma));
  }
  if (key === "Kategorie") {
    products.value.sort((a, b) =>
      a.produktkategorie.localeCompare(b.produktkategorie)
    );
  }
  if (key === "Preis/Pkg") {
    products.value.sort((a, b) => a.preisPerPackung - b.preisPerPackung);
    console.log(products);
  }
  if (key === "PreisProKG") {
    products.value.sort((a, b) => a.preisPerKG - b.preisPerKG);
    console.log(products);
  }
  if (key === "Produktname") {
    products.value.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (key === "Portionierung") {
    products.value.sort((a, b) => a.portionierung - b.portionierung);
  }
  if (key === "PortionenPerPkg") {
    products.value.sort((a, b) => a.portionenPerPkg - b.portionenPerPkg);
  }
  if (key === "GewichtPerPkg") {
    products.value.sort((a, b) => a.gewichtPerPkg - b.gewichtPerPkg);
  }
  if (key === "vegan") {
    products.value.sort((a, b) => {
      if (a.vegan === "yes" && b.vegan === "no") return -1;
      if (a.vegan === "no" && b.vegan === "yes") return 1;
      return 0;
    });
  }
};

const isVegan = ref(false);
const productType = ref("");
const packSize = ref({ lower: 100, upper: 2000 });

import FirmaFilter from "../components/Filter/FirmaFilter.vue";
import ProduktkategorieFilter from "../components/Filter/ProduktkategorieFilter.vue";

//TODO Dummies austauschen? Die Frage ist hier oder in der Ecxel auf nem zweiten sheet?
const firmenListe = ref([
  { value: "ESN", label: "ESN" },
  { value: "Bulk", label: "Bulk" },
  { value: "BodyLab", label: "BodyLab" },
]);
type Firma = { value: string; label: string };
const selectedFirmenFromChild = ref<Firma[]>([]);

const handleSelectedFirmen = (selectedFirma: string[]) => {
  console.log("Selected firms:", selectedFirma);
  const selectedFirmenAsObjects: Firma[] = selectedFirma.map((firma) => ({
    value: firma,
    label: firma, // Du kannst den Wert von 'label' anpassen, falls erforderlich
  }));
  selectedFirmenFromChild.value = selectedFirmenAsObjects;
};

type ProduktKategorie = { value: string; label: string };
const selectedProduktKategorieFromChild = ref<ProduktKategorie[]>([]);

const handleSelectedProduktKategorie = (
  SelectedProduktKategorieChange: string[]
) => {
  console.log("Selected ProduktKategorie:", SelectedProduktKategorieChange);
  const selectedProduktKategorieAsObjects: ProduktKategorie[] =
    SelectedProduktKategorieChange.map((produktKategorie) => ({
      value: produktKategorie,
      label: produktKategorie, // Du kannst den Wert von 'label' anpassen, falls erforderlich
    }));
  selectedProduktKategorieFromChild.value = selectedProduktKategorieAsObjects;
};

const filteredProducts = computed(() => {
  // Wenn alle Filter deaktiviert sind
  if (
    selectedFirmenFromChild.value.length === 0 &&
    selectedProduktKategorieFromChild.value.length === 0 &&
    selectedMaxPriceFromChild.value === null &&
    !isCheckedref.value &&
    SelectedPakgSizeFromChild.value.lower === 0 &&
    SelectedPakgSizeFromChild.value.upper === 0
  ) {
    console.log("All Filter Off: First time?");
    return products.value;
  }

  return products.value.filter((product) => {
    const gewichtAsNumber = parseInt(product.gewichtPerPkg, 10);

    const isFirmValid =
      selectedFirmenFromChild.value.length === 0 ||
      selectedFirmenFromChild.value.some(
        (firma) => firma.value === product.firma
      );

    const isProductCategoryValid =
      selectedProduktKategorieFromChild.value.length === 0 ||
      selectedProduktKategorieFromChild.value.some(
        (kategorie) => kategorie.value === product.produktkategorie
      );

    const isPriceValid =
      selectedMaxPriceFromChild.value === null ||
      product.preisPerKG <= selectedMaxPriceFromChild.value;

    const isVeganValid =
      !isCheckedref.value || product.vegan == "yes";

    const isPakgSizeValid =
      (SelectedPakgSizeFromChild.value.lower === 0 &&
        SelectedPakgSizeFromChild.value.upper === 0) ||
      (gewichtAsNumber >= SelectedPakgSizeFromChild.value.lower &&
        gewichtAsNumber <= SelectedPakgSizeFromChild.value.upper);

    return (
      isFirmValid &&
      isProductCategoryValid &&
      isPriceValid &&
      isVeganValid &&
      isPakgSizeValid
    );
  });
});

const productKategorieListe = ref([
  { value: "Protein", label: "Protein" },
  { value: "Creatine", label: "Kreatine" },
  // TODO weitere Optionen
]);

import PriceRangeFilter from "../components/Filter/PriceRangeFilter.vue";
const selectedMaxPriceFromChild = ref<number | null>(null);
const handleValidMaxPrice = (maxPrice: string) => {
  // Speichere den Wert in selectedMaxPriceFromChild
  selectedMaxPriceFromChild.value = parseFloat(maxPrice.replace(",", "."));
};

const handleVeganChange = (value) => {
  isCheckedref.value = value;
  // Führe hier weitere Aktionen basierend auf dem geänderten Wert aus
};
const isCheckedref = ref(false);

import veganFilter from "@/components/Filter/veganFilter.vue";
// const selectedIsVeganFromChild = ref<boolean>(false);

// console.log("Übertrag hat geklappt. "+isChecked.value + typeof isChecked)
// selectedIsVeganFromChild.value =isChecked
// console.log("Ütest. "+selectedIsVeganFromChild.value)
</script>

<style scoped>
.Container {
  display: flex;
  align-items: start;
}
.filter-wrapper {
  flex: 0 0 25%;
  padding-right: 1rem;
  flex-basis: calc(
    25% - 60px
  ); /* Nimmt 25% der Breite minus 60px (30px auf jeder Seite) ein */
  margin: 10% 0 0 5%;
}

.pckLabel {
  --label-width: 150px; /* oder ein anderer geeigneter Wert */
  padding-bottom: 5px;
}

.list-wrapper {
  display: flex;
  overflow-x: auto;
  flex-wrap: nowrap;
  /* margin-left: 25%; */
  margin-top: 10%;
  margin-right: 10%;
  flex: 1; /* Nimmt den verbleibenden Raum ein */
  overflow-x: auto;
}
.filter-wrapper ion-label {
  margin: 0; /* Entfernt den Margin */
}

ion-range::part(tick) {
  background: #a2d2ff;
}

ion-range::part(tick-active) {
  background: #bde0fe;
}

ion-range::part(pin) {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  background: #ffafcc;
  color: #fff;

  border-radius: 50%;
  transform: scale(1.01);

  top: -20px;

  min-width: 28px;
  height: 28px;
  transition:
    transform 120ms ease,
    background 120ms ease;
}

ion-range::part(pin)::before {
  content: none;
}

ion-range::part(knob) {
  background: #ffc8dd;
}

ion-range::part(bar) {
  background: #a2d2ff;
}

ion-range::part(bar-active) {
  background: #bde0fe;
}

.price-range {
  display: flex;
  justify-content: space-between;
}
</style>
