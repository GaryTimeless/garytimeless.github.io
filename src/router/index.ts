import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import FitComPage from '../views/FitComPage.vue'
import { Component } from 'ionicons/dist/types/stencil-public-runtime';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/product'
  },
  {
    path: '/product',
    name: 'FitCom',
    component:FitComPage
  },
  {
    path: '/:catchAll(.*)', redirect:'/'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
