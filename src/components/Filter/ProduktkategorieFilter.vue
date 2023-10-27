  <template>
    <ion-list>
      <ion-item>
        <ion-select
          aria-label="ProduktKategorie"
          placeholder="Wähle Produkt Kategorie aus"
          @ionChange="handleChange"
          :multiple="true"
        >
        <ion-select-option v-for="kategorie in productKategorie" :key="kategorie.value" :value="kategorie.value">
          {{ kategorie.label }}
        </ion-select-option>
        </ion-select>
      </ion-item>
    </ion-list>
  </template>



  <script lang="ts">
import { IonItem, IonList, IonSelect, IonSelectOption } from '@ionic/vue';
import { Ref, defineComponent, ref } from 'vue';
export default defineComponent({
  components: { IonItem, IonList, IonSelect, IonSelectOption },
    props: {
      productKategorie: {
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
      console.log('Ausgewählte ProduktKategorien:', event.detail.value);
      this.selectedValues = event.detail.value;
      this.$emit('SelectedProduktKategorieChange', this.selectedValues);
    },
    
    
  },
  });
  </script>
  
  <style>
    /* Ihre Styles */
  </style>
  