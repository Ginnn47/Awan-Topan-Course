"""
Management command to seed realistic Indonesian students and enroll 7-12 students
into every ClassGroup in the Awan Topan Course system.
"""

from datetime import date
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import ClassGroup, Enrollment, Student

COHORT_STUDENTS = {
    "6 SD": [
        ("STD-06-001", "Aditia Pratama", date(2014, 5, 12), "SDN Merdeka 1", "6 SD", "Bpk. Bambang P.", "081234560601"),
        ("STD-06-002", "Bilqis Azzahra", date(2014, 8, 22), "SD IT Al-Hikmah", "6 SD", "Ibu Sri Rahayu", "081234560602"),
        ("STD-06-003", "Dimas Setiawan", date(2014, 2, 17), "SDN Percobaan 2", "6 SD", "Bpk. Hendra S.", "081234560603"),
        ("STD-06-004", "Fajar Nugraha", date(2014, 11, 5), "SDN Sukamaju 1", "6 SD", "Bpk. Gunawan", "081234560604"),
        ("STD-06-005", "Hana Maulida", date(2014, 4, 30), "SD IT Bina Insan", "6 SD", "Ibu Dewi Sartika", "081234560605"),
        ("STD-06-006", "Ihsan Ramadhan", date(2014, 7, 19), "SDN Harapan Bangsa", "6 SD", "Bpk. Ahmad Fauzi", "081234560606"),
        ("STD-06-007", "Kayla Putri", date(2014, 9, 14), "SD Islam Terpadu", "6 SD", "Ibu Rina Melati", "081234560607"),
        ("STD-06-008", "Luthfi Hakim", date(2014, 1, 28), "SDN Merdeka 1", "6 SD", "Bpk. Lukman Hakim", "081234560608"),
        ("STD-06-009", "Nabila Syakira", date(2014, 6, 8), "SD IT Al-Hikmah", "6 SD", "Ibu Yuni Astuti", "081234560609"),
        ("STD-06-010", "Raditya Putra", date(2014, 10, 25), "SDN Percobaan 2", "6 SD", "Bpk. Joko Susilo", "081234560610"),
    ],
    "7A": [
        ("STD-07A-001", "Alif Pratama", date(2013, 3, 15), "SMPN 1 Kota", "7 SMP", "Bpk. Eko Prasetyo", "081234560701"),
        ("STD-07A-002", "Bunga Cantika", date(2013, 7, 20), "SMPN 2 Kota", "7 SMP", "Ibu Ratna Juwita", "081234560702"),
        ("STD-07A-003", "Daffa Ibnu", date(2013, 1, 10), "SMP IT Nurul Fikri", "7 SMP", "Bpk. Ibnu Sina", "081234560703"),
        ("STD-07A-004", "Farhan Maulana", date(2013, 9, 5), "SMPN 1 Kota", "7 SMP", "Bpk. Maulana Malik", "081234560704"),
        ("STD-07A-005", "Gita Gutawa", date(2013, 4, 18), "SMPN 3 Kota", "7 SMP", "Ibu Endang Sri", "081234560705"),
        ("STD-07A-006", "Hafiz Syahputra", date(2013, 6, 25), "SMPN 1 Kota", "7 SMP", "Bpk. Syahputra", "081234560706"),
        ("STD-07A-007", "Indah Permata", date(2013, 11, 12), "SMPN 2 Kota", "7 SMP", "Ibu Permatasari", "081234560707"),
        ("STD-07A-008", "Jovan Alexander", date(2013, 2, 28), "SMP Kristen 1", "7 SMP", "Bpk. Alexander", "081234560708"),
        ("STD-07A-009", "Kania Dewi", date(2013, 8, 9), "SMPN 3 Kota", "7 SMP", "Ibu Dewi Sartika", "081234560709"),
        ("STD-07A-010", "Lukman Nulhakim", date(2013, 12, 1), "SMP IT Nurul Fikri", "7 SMP", "Bpk. Nulhakim", "081234560710"),
    ],
    "7B": [
        ("STD-07B-001", "Mutiara Annisa", date(2013, 5, 14), "SMPN 1 Kota", "7 SMP", "Ibu Annisa Tri", "081234560711"),
        ("STD-07B-002", "Naufal Zaki", date(2013, 8, 19), "SMPN 2 Kota", "7 SMP", "Bpk. Zaki M.", "081234560712"),
        ("STD-07B-003", "Olivia Safitri", date(2013, 3, 22), "SMPN 4 Kota", "7 SMP", "Ibu Safitri Indah", "081234560713"),
        ("STD-07B-004", "Panji Gemilang", date(2013, 10, 7), "SMPN 2 Kota", "7 SMP", "Bpk. Gemilang", "081234560714"),
        ("STD-07B-005", "Qonita Rahma", date(2013, 2, 11), "SMP IT Al-Azhar", "7 SMP", "Ibu Rahmawati", "081234560715"),
        ("STD-07B-006", "Rafi Ahmad", date(2013, 7, 30), "SMPN 1 Kota", "7 SMP", "Bpk. Ahmad Subarjo", "081234560716"),
        ("STD-07B-007", "Salma Salsabila", date(2013, 9, 16), "SMPN 4 Kota", "7 SMP", "Ibu Salsabila", "081234560717"),
        ("STD-07B-008", "Tegar Prakoso", date(2013, 12, 4), "SMPN 2 Kota", "7 SMP", "Bpk. Prakoso", "081234560718"),
        ("STD-07B-009", "Ulfa Khoirunnisa", date(2013, 4, 27), "SMP IT Al-Azhar", "7 SMP", "Ibu Khoirunnisa", "081234560719"),
        ("STD-07B-010", "Vino Bastian", date(2013, 6, 15), "SMPN 1 Kota", "7 SMP", "Bpk. Bastian", "081234560720"),
    ],
    "8A": [
        ("STD-08A-001", "Arya Wirayudha", date(2012, 4, 11), "SMPN 1 Kota", "8 SMP", "Bpk. Wirayudha", "081234560801"),
        ("STD-08A-002", "Bella Saphira", date(2012, 8, 24), "SMPN 2 Kota", "8 SMP", "Ibu Saphira", "081234560802"),
        ("STD-08A-003", "Chandra Kirana", date(2012, 1, 19), "SMPN 3 Kota", "8 SMP", "Bpk. Kirana", "081234560803"),
        ("STD-08A-004", "Danu Prasetyo", date(2012, 6, 13), "SMPN 1 Kota", "8 SMP", "Bpk. Prasetyo", "081234560804"),
        ("STD-08A-005", "Elsa Mayori", date(2012, 10, 5), "SMPN 2 Kota", "8 SMP", "Ibu Mayori", "081234560805"),
        ("STD-08A-006", "Galih Firmansyah", date(2012, 3, 29), "SMPN 1 Kota", "8 SMP", "Bpk. Firmansyah", "081234560806"),
        ("STD-08A-007", "Hesti Purwanti", date(2012, 9, 18), "SMPN 4 Kota", "8 SMP", "Ibu Purwanti", "081234560807"),
        ("STD-08A-008", "Ilham Fauzi", date(2012, 12, 22), "SMPN 3 Kota", "8 SMP", "Bpk. Fauzi", "081234560808"),
        ("STD-08A-009", "Jessica Mila", date(2012, 5, 7), "SMP Kristen 1", "8 SMP", "Ibu Mila Agnes", "081234560809"),
        ("STD-08A-010", "Kevin Sanjaya", date(2012, 7, 31), "SMPN 1 Kota", "8 SMP", "Bpk. Sanjaya Sukamto", "081234560810"),
        ("STD-08A-011", "Larasati Utami", date(2012, 2, 14), "SMPN 2 Kota", "8 SMP", "Ibu Utami Ningsih", "081234560811"),
        ("STD-08A-012", "Marcel Radhival", date(2012, 11, 9), "SMPN 4 Kota", "8 SMP", "Bpk. Radhival", "081234560812"),
    ],
    "8B": [
        ("STD-08B-001", "Nadya Arina", date(2012, 3, 8), "SMPN 1 Kota", "8 SMP", "Ibu Arina", "081234560813"),
        ("STD-08B-002", "Oki Setiana", date(2012, 7, 16), "SMPN 2 Kota", "8 SMP", "Bpk. Setiana", "081234560814"),
        ("STD-08B-003", "Prilly Latu", date(2012, 10, 21), "SMPN 3 Kota", "8 SMP", "Ibu Latuconsina", "081234560815"),
        ("STD-08B-004", "Rangga Azof", date(2012, 5, 2), "SMPN 1 Kota", "8 SMP", "Bpk. Azof", "081234560816"),
        ("STD-08B-005", "Syifa Hadju", date(2012, 9, 11), "SMPN 2 Kota", "8 SMP", "Ibu Hadju", "081234560817"),
        ("STD-08B-006", "Tora Sudiro", date(2012, 12, 15), "SMPN 4 Kota", "8 SMP", "Bpk. Sudiro", "081234560818"),
        ("STD-08B-007", "Umay Shahab", date(2012, 4, 25), "SMPN 1 Kota", "8 SMP", "Bpk. Shahab", "081234560819"),
        ("STD-08B-008", "Vanessa Angelia", date(2012, 8, 30), "SMPN 3 Kota", "8 SMP", "Ibu Angelia", "081234560820"),
        ("STD-08B-009", "Wildan Alamsyah", date(2012, 1, 6), "SMPN 2 Kota", "8 SMP", "Bpk. Alamsyah", "081234560821"),
        ("STD-08B-010", "Yasmin Napper", date(2012, 6, 19), "SMPN 1 Kota", "8 SMP", "Ibu Napper", "081234560822"),
        ("STD-08B-011", "Zikri Daulay", date(2012, 11, 27), "SMPN 4 Kota", "8 SMP", "Bpk. Daulay", "081234560823"),
    ],
    "9A": [
        ("STD-09A-001", "Abidzar Al-Ghifari", date(2011, 4, 13), "SMPN 1 Kota", "9 SMP", "Bpk. Uje Al-Ghifari", "081234560901"),
        ("STD-09A-002", "Beby Tsabina", date(2011, 10, 27), "SMPN 2 Kota", "9 SMP", "Ibu Tsabina", "081234560902"),
        ("STD-09A-003", "Caitlin Halderman", date(2011, 7, 17), "SMPN 1 Kota", "9 SMP", "Bpk. Halderman", "081234560903"),
        ("STD-09A-004", "Daffa Wardhana", date(2011, 11, 28), "SMPN 3 Kota", "9 SMP", "Bpk. Wardhana", "081234560904"),
        ("STD-09A-005", "Enzy Storia", date(2011, 8, 10), "SMPN 2 Kota", "9 SMP", "Ibu Storia", "081234560905"),
        ("STD-09A-006", "Febby Rastanty", date(2011, 2, 1), "SMPN 1 Kota", "9 SMP", "Ibu Rastanty", "081234560906"),
        ("STD-09A-007", "Giorgino Abraham", date(2011, 11, 30), "SMPN 4 Kota", "9 SMP", "Bpk. Abraham", "081234560907"),
        ("STD-09A-008", "Hanggini Purinda", date(2011, 9, 21), "SMPN 1 Kota", "9 SMP", "Ibu Purinda", "081234560908"),
        ("STD-09A-009", "Iqbaal Ramadhan", date(2011, 12, 28), "SMPN 2 Kota", "9 SMP", "Bpk. Herry Ramadhan", "081234560909"),
        ("STD-09A-010", "Jefri Nichol", date(2011, 1, 15), "SMPN 3 Kota", "9 SMP", "Bpk. John Nichol", "081234560910"),
        ("STD-09A-011", "Kesha Ratuliu", date(2011, 6, 5), "SMPN 1 Kota", "9 SMP", "Ibu Mona Ratuliu", "081234560911"),
        ("STD-09A-012", "Laura Theux", date(2011, 3, 28), "SMPN 2 Kota", "9 SMP", "Ibu Theux", "081234560912"),
    ],
    "9B": [
        ("STD-09B-001", "Maxime Bouttier", date(2011, 4, 22), "SMPN 1 Kota", "9 SMP", "Bpk. Bouttier", "081234560913"),
        ("STD-09B-002", "Natasha Wilona", date(2011, 12, 15), "SMPN 2 Kota", "9 SMP", "Ibu Theresia", "081234560914"),
        ("STD-09B-003", "Omar Daniel", date(2011, 4, 9), "SMPN 3 Kota", "9 SMP", "Bpk. Daniel", "081234560915"),
        ("STD-09B-004", "Pamela Bowie", date(2011, 10, 18), "SMPN 1 Kota", "9 SMP", "Ibu Bowie", "081234560916"),
        ("STD-09B-005", "Randy Martin", date(2011, 11, 18), "SMPN 4 Kota", "9 SMP", "Bpk. Martin", "081234560917"),
        ("STD-09B-006", "Steffi Zamora", date(2011, 12, 15), "SMPN 2 Kota", "9 SMP", "Ibu Zamora", "081234560918"),
        ("STD-09B-007", "Teuku Rassya", date(2011, 2, 4), "SMPN 1 Kota", "9 SMP", "Bpk. Teuku Rafly", "081234560919"),
        ("STD-09B-008", "Valerie Thomas", date(2011, 7, 22), "SMPN 3 Kota", "9 SMP", "Bpk. Jeremy Thomas", "081234560920"),
        ("STD-09B-009", "Wafda Saifan", date(2011, 6, 4), "SMPN 2 Kota", "9 SMP", "Bpk. Saifan", "081234560921"),
        ("STD-09B-010", "Yoriko Angeline", date(2011, 8, 23), "SMPN 1 Kota", "9 SMP", "Ibu Angeline", "081234560922"),
        ("STD-09B-011", "Zulfa Maharani", date(2011, 12, 10), "SMPN 4 Kota", "9 SMP", "Ibu Maharani", "081234560923"),
    ],
    "10A": [
        ("STD-10A-001", "Aditya Zoni", date(2010, 2, 2), "SMAN 1 Kota", "10 SMA", "Bpk. Suhendri Zoni", "081234561001"),
        ("STD-10A-002", "Brisia Jodie", date(2010, 3, 30), "SMAN 2 Kota", "10 SMA", "Ibu Jodie", "081234561002"),
        ("STD-10A-003", "Cut Syifa", date(2010, 9, 18), "SMAN 1 Kota", "10 SMA", "Bpk. Rommel", "081234561003"),
        ("STD-10A-004", "Deva Mahenra", date(2010, 4, 19), "SMAN 3 Kota", "10 SMA", "Bpk. Mahenra", "081234561004"),
        ("STD-10A-005", "Ersya Aurelia", date(2010, 6, 7), "SMAN 2 Kota", "10 SMA", "Ibu Aurelia", "081234561005"),
        ("STD-10A-006", "Fachri Albar", date(2010, 11, 15), "SMAN 1 Kota", "10 SMA", "Bpk. Ahmad Albar", "081234561006"),
        ("STD-10A-007", "Gege Elisa", date(2010, 1, 10), "SMAN 4 Kota", "10 SMA", "Ibu Elisa", "081234561007"),
        ("STD-10A-008", "Harris Vriza", date(2010, 11, 24), "SMAN 1 Kota", "10 SMA", "Bpk. Vriza", "081234561008"),
        ("STD-10A-009", "Indah Indriana", date(2010, 11, 5), "SMAN 3 Kota", "10 SMA", "Ibu Indriana", "081234561009"),
        ("STD-10A-010", "Junior Roberts", date(2010, 11, 9), "SMAN 2 Kota", "10 SMA", "Bpk. Roberts", "081234561010"),
        ("STD-10A-011", "Kiki Farrel", date(2010, 5, 26), "SMAN 1 Kota", "10 SMA", "Ibu Farrel", "081234561011"),
        ("STD-10A-012", "Lyodra Ginting", date(2010, 6, 21), "SMAN 2 Kota", "10 SMA", "Bpk. Simar Ginting", "081234561012"),
    ],
    "10B": [
        ("STD-10B-001", "Megan Domani", date(2010, 10, 14), "SMAN 1 Kota", "10 SMA", "Bpk. Domani", "081234561013"),
        ("STD-10B-002", "Nicho Bryant", date(2010, 8, 17), "SMAN 3 Kota", "10 SMA", "Bpk. Bryant", "081234561014"),
        ("STD-10B-003", "Ochi Rosdiana", date(2010, 12, 10), "SMAN 2 Kota", "10 SMA", "Ibu Rosdiana", "081234561015"),
        ("STD-10B-004", "Pevita Pearce", date(2010, 10, 6), "SMAN 1 Kota", "10 SMA", "Bpk. Bram Pearce", "081234561016"),
        ("STD-10B-005", "Rizky Nazar", date(2010, 3, 7), "SMAN 4 Kota", "10 SMA", "Bpk. Nazar Mubarak", "081234561017"),
        ("STD-10B-006", "Sandrinna Michelle", date(2010, 1, 11), "SMAN 2 Kota", "10 SMA", "Ibu Michelle", "081234561018"),
        ("STD-10B-007", "Tiara Andini", date(2010, 9, 23), "SMAN 1 Kota", "10 SMA", "Bpk. Nugroho", "081234561019"),
        ("STD-10B-008", "Ummi Quary", date(2010, 1, 30), "SMAN 3 Kota", "10 SMA", "Ibu Quary", "081234561020"),
        ("STD-10B-009", "Verrell Bramasta", date(2010, 9, 11), "SMAN 2 Kota", "10 SMA", "Bpk. Ivan Fadilla", "081234561021"),
        ("STD-10B-010", "Wendy Walters", date(2010, 5, 27), "SMAN 1 Kota", "10 SMA", "Ibu Walters", "081234561022"),
        ("STD-10B-011", "Ziva Magnolya", date(2010, 3, 14), "SMAN 4 Kota", "10 SMA", "Bpk. Stevanus Magnolya", "081234561023"),
    ],
    "11A": [
        ("STD-11A-001", "Angga Yunanda", date(2009, 5, 16), "SMAN 1 Kota", "11 SMA", "Bpk. Muhammad Yunu", "081234561101"),
        ("STD-11A-002", "Beby Chaesara", date(2009, 3, 18), "SMAN 2 Kota", "11 SMA", "Ibu Chaesara", "081234561102"),
        ("STD-11A-003", "Chicco Kurniawan", date(2009, 10, 6), "SMAN 1 Kota", "11 SMA", "Bpk. Kurniawan", "081234561103"),
        ("STD-11A-004", "Dannia Salsabilla", date(2009, 1, 4), "SMAN 3 Kota", "11 SMA", "Ibu Salsabilla", "081234561104"),
        ("STD-11A-005", "Endy Arfian", date(2009, 5, 22), "SMAN 2 Kota", "11 SMA", "Bpk. Arfian", "081234561105"),
        ("STD-11A-006", "Freya Jayawardana", date(2009, 2, 13), "SMAN 1 Kota", "11 SMA", "Bpk. Jayawardana", "081234561106"),
        ("STD-11A-007", "Gracia JKT", date(2009, 8, 31), "SMAN 4 Kota", "11 SMA", "Ibu Gracia", "081234561107"),
        ("STD-11A-008", "Haruka Nakagawa", date(2009, 2, 10), "SMAN 1 Kota", "11 SMA", "Bpk. Nakagawa", "081234561108"),
        ("STD-11A-009", "Irzan Faiq", date(2009, 1, 21), "SMAN 3 Kota", "11 SMA", "Bpk. Faiq", "081234561109"),
        ("STD-11A-010", "Jessica Veranda", date(2009, 8, 19), "SMAN 2 Kota", "11 SMA", "Ibu Veranda", "081234561110"),
        ("STD-11A-011", "Kinal Putri", date(2009, 1, 2), "SMAN 1 Kota", "11 SMA", "Ibu Kinal", "081234561111"),
    ],
    "11B": [
        ("STD-11B-001", "Melody Laksani", date(2009, 3, 24), "SMAN 1 Kota", "11 SMA", "Ibu Laksani", "081234561112"),
        ("STD-11B-002", "Nabilah Ratna", date(2009, 11, 11), "SMAN 2 Kota", "11 SMA", "Ibu Ratna Ayu", "081234561113"),
        ("STD-11B-003", "Oki Lukman", date(2009, 8, 25), "SMAN 3 Kota", "11 SMA", "Bpk. Lukman S.", "081234561114"),
        ("STD-11B-004", "Panji Pragiwaksono", date(2009, 6, 18), "SMAN 1 Kota", "11 SMA", "Bpk. Pragiwaksono", "081234561115"),
        ("STD-11B-005", "Qausar Harta", date(2009, 9, 2), "SMAN 4 Kota", "11 SMA", "Bpk. Harta", "081234561116"),
        ("STD-11B-006", "Rayn Wijaya", date(2009, 10, 26), "SMAN 2 Kota", "11 SMA", "Bpk. Wijaya", "081234561117"),
        ("STD-11B-007", "Shania Junianatha", date(2009, 6, 27), "SMAN 1 Kota", "11 SMA", "Ibu Junianatha", "081234561118"),
        ("STD-11B-008", "Tarra Budiman", date(2009, 9, 22), "SMAN 3 Kota", "11 SMA", "Bpk. Budiman", "081234561119"),
        ("STD-11B-009", "Uus Kartobi", date(2009, 12, 23), "SMAN 2 Kota", "11 SMA", "Bpk. Kartobi", "081234561120"),
        ("STD-11B-010", "Vanesha Prescilla", date(2009, 10, 25), "SMAN 1 Kota", "11 SMA", "Ibu Prescilla", "081234561121"),
    ],
    "11": [
        ("STD-11-001", "Bintang Emon", date(2009, 5, 5), "SMAN 1 Kota", "11 SMA", "Bpk. Emon", "081234561131"),
        ("STD-11-002", "Coki Pardede", date(2009, 1, 21), "SMAN 2 Kota", "11 SMA", "Bpk. Pardede", "081234561132"),
        ("STD-11-003", "Desta Mahendra", date(2009, 3, 15), "SMAN 1 Kota", "11 SMA", "Bpk. Mahendra S.", "081234561133"),
        ("STD-11-004", "Enzy Storia Jr", date(2009, 8, 10), "SMAN 3 Kota", "11 SMA", "Ibu Storia Jr", "081234561134"),
        ("STD-11-005", "Gading Marten", date(2009, 5, 8), "SMAN 2 Kota", "11 SMA", "Bpk. Roy Marten", "081234561135"),
        ("STD-11-006", "Hesti Purwadinata", date(2009, 6, 15), "SMAN 1 Kota", "11 SMA", "Ibu Purwadinata", "081234561136"),
        ("STD-11-007", "Indra Jegel", date(2009, 11, 5), "SMAN 4 Kota", "11 SMA", "Bpk. Jegel", "081234561137"),
        ("STD-11-008", "Kaesang Pangarep", date(2009, 12, 25), "SMAN 1 Kota", "11 SMA", "Bpk. Joko Widodo", "081234561138"),
        ("STD-11-009", "Mamat Alkatiri", date(2009, 6, 24), "SMAN 3 Kota", "11 SMA", "Bpk. Alkatiri", "081234561139"),
        ("STD-11-010", "Praz Teguh", date(2009, 6, 10), "SMAN 2 Kota", "11 SMA", "Bpk. Teguh", "081234561140"),
        ("STD-11-011", "Rigen Rakelna", date(2009, 11, 19), "SMAN 1 Kota", "11 SMA", "Bpk. Rakelna", "081234561141"),
    ],
    "12": [
        ("STD-12-001", "Adipati Dolken", date(2008, 8, 19), "SMAN 1 Kota", "12 SMA", "Bpk. Didit Rukman", "081234561201"),
        ("STD-12-002", "Chelsea Islan", date(2008, 6, 2), "SMAN 2 Kota", "12 SMA", "Ibu Samantha Islan", "081234561202"),
        ("STD-12-003", "Dion Wiyoko", date(2008, 5, 3), "SMAN 1 Kota", "12 SMA", "Bpk. Wiyoko", "081234561203"),
        ("STD-12-004", "Eva Celia", date(2008, 9, 21), "SMAN 3 Kota", "12 SMA", "Bpk. Indra Lesmana", "081234561204"),
        ("STD-12-005", "Fedi Nuril", date(2008, 7, 1), "SMAN 2 Kota", "12 SMA", "Bpk. Nuril", "081234561205"),
        ("STD-12-006", "Gita Savitri", date(2008, 6, 5), "SMAN 1 Kota", "12 SMA", "Ibu Savitri Devi", "081234561206"),
        ("STD-12-007", "Herjunot Ali", date(2008, 10, 8), "SMAN 4 Kota", "12 SMA", "Bpk. Ali", "081234561207"),
        ("STD-12-008", "Isyana Sarasvati", date(2008, 5, 2), "SMAN 1 Kota", "12 SMA", "Ibu Luana Marpanda", "081234561208"),
        ("STD-12-009", "Joe Taslim", date(2008, 6, 23), "SMAN 3 Kota", "12 SMA", "Bpk. Taslim", "081234561209"),
        ("STD-12-010", "Maudy Ayunda", date(2008, 12, 19), "SMAN 2 Kota", "12 SMA", "Ibu Muren Jasmedi", "081234561210"),
        ("STD-12-011", "Nicholas Saputra", date(2008, 2, 24), "SMAN 1 Kota", "12 SMA", "Bpk. Horst Schunemann", "081234561211"),
        ("STD-12-012", "Raisa Andriana", date(2008, 6, 6), "SMAN 4 Kota", "12 SMA", "Bpk. Allan Rachman", "081234561212"),
    ],
}

# Room mapping for class groups to display beautifully in UI
ROOM_MAPPING = {
    "6 SD": "Ruang Alpha",
    "7A": "Ruang 101",
    "7B": "Ruang 102",
    "8A": "Ruang 103",
    "8B": "Ruang Beta",
    "9A": "Ruang 201",
    "9B": "Ruang 202",
    "10A": "Ruang 203",
    "10B": "Ruang Gamma",
    "11A": "Ruang 301",
    "11B": "Ruang 302",
    "11": "Ruang Studio",
    "12": "Ruang Audiovisual",
    "11-MAT-A": "Ruang 101",
}


class Command(BaseCommand):
    help = "Seed realistic students and enroll 7-12 students into every active ClassGroup"

    def add_arguments(self, parser):
        parser.add_argument("--database", default="default", help="Database alias to use")

    def handle(self, *args, **options):
        db = options["database"]

        self.stdout.write("=" * 80)
        self.stdout.write(" SEEDER MURID DAN ENROLLMENT (7-12 SISWA PER KELAS)")
        self.stdout.write("=" * 80)

        with transaction.atomic(using=db):
            # 1. Create or update Students by cohort
            cohort_student_objs = {}
            total_students_created = 0
            for cohort_key, student_list in COHORT_STUDENTS.items():
                cohort_student_objs[cohort_key] = []
                for sid, name, bdate, school, grade, pname, pphone in student_list:
                    student, created = Student.objects.using(db).update_or_create(
                        student_id=sid,
                        defaults={
                            "full_name": name,
                            "birth_date": bdate,
                            "school": school,
                            "grade": grade,
                            "parent_name": pname,
                            "parent_phone": pphone,
                            "status": Student.Status.ACTIVE,
                        },
                    )
                    cohort_student_objs[cohort_key].append(student)
                    if created:
                        total_students_created += 1

            self.stdout.write(f"[1] Berhasil memproses {len(COHORT_STUDENTS)} kohort murid ({total_students_created} baru dibuat).")

            # 2. Assign room names and enroll 7-12 students into every ClassGroup
            all_cgs = ClassGroup.objects.using(db).filter(is_active=True)
            self.stdout.write(f"\n[2] Menghubungkan murid ke {all_cgs.count()} Rombel (ClassGroup)...")

            for cg in all_cgs:
                # Assign nice room name
                room_assigned = ROOM_MAPPING.get(cg.name, "Ruang 101")
                if cg.room != room_assigned:
                    cg.room = room_assigned
                    cg.save(update_fields=["room"])

                # Determine cohort to enroll
                cohort_key = cg.name
                students_to_enroll = cohort_student_objs.get(cohort_key)

                if not students_to_enroll:
                    # Fallback for baseline like 11-MAT-A or any other cohort
                    if "11" in cg.name:
                        students_to_enroll = cohort_student_objs.get("11A", [])[:9]
                    else:
                        students_to_enroll = cohort_student_objs.get("10A", [])[:8]

                # Enroll students (between 7 and 12)
                for st in students_to_enroll:
                    Enrollment.objects.using(db).get_or_create(
                        student=st,
                        class_group=cg,
                        defaults={
                            "joined_at": date(2026, 7, 15),
                            "is_active": True,
                        },
                    )

            # 3. Final Validation
            self.stdout.write("\n" + "=" * 80)
            self.stdout.write(" HASIL VALIDASI ENROLLMENT PER KELAS")
            self.stdout.write("=" * 80)
            all_valid = True
            for cg in all_cgs.order_by("name", "subject__name"):
                count = cg.students.filter(enrollment__is_active=True).count()
                is_valid = 7 <= count <= 12
                if not is_valid:
                    all_valid = False
                status_str = "SESUAI" if is_valid else "TIDAK SESUAI"
                self.stdout.write(f" - Kelas {cg.name:8} ({cg.subject.name:20}) | Ruang: {cg.room:15} | Jumlah Siswa: {count:2} -> {status_str}")

            self.stdout.write("=" * 80)
            if all_valid:
                self.stdout.write(self.style.SUCCESS(" SEMUA KELAS TERVERIFIKASI BERISI 7-12 SISWA!"))
            else:
                self.stdout.write(self.style.ERROR(" ADA KELAS DENGAN JUMLAH SISWA DI LUAR RANGE 7-12!"))
            self.stdout.write("=" * 80)
